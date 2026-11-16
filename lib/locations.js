import "server-only";

import { ObjectId } from "mongodb";

import { db, ensureMongoConnected } from "./db.js";
import {
  DEFAULT_CURRENCY,
  LOCATION_CURRENCIES,
  USUAL_SOURCES,
  harareInboundTotals,
  isTransferAllowed,
  slugifyLocationName,
  usualSourceForName,
} from "./location-rules.js";
import {
  LOCATION_SLUGS,
  MOVEMENT_TYPE,
  TRANSFER_STATUS,
} from "./stock-ledger.js";

const locations = () => db.collection("location");
const locationStock = () => db.collection("location_stock");
const transfers = () => db.collection("stock_transfer");
const products = () => db.collection("product");
const movements = () => db.collection("stock_movement");
const sales = () => db.collection("sale");
const expenses = () => db.collection("expense");
const users = () => db.collection("user");
const meta = () => db.collection("app_meta");

const LOCATION_MIGRATION_KEY = "locations_v1";
const CURRENCY_MIGRATION_KEY = "locations_currency_v1";

/** Warm-instance cache — skip DB work after the first successful ensure. */
const globalLoc = globalThis;
if (!globalLoc._stocklyLocationsReady) {
  globalLoc._stocklyLocationsReady = null;
}

export function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function serializeLocation({ _id, supplyHubId, ...rest }) {
  return {
    id: String(_id),
    ...rest,
    currency: rest.currency || DEFAULT_CURRENCY,
    supplyHubId: supplyHubId ? String(supplyHubId) : null,
    isHub: Boolean(rest.isHub),
    isSystem: Boolean(rest.isSystem),
  };
}

let indexesPromise = null;
export async function ensureLocationIndexes() {
  if (indexesPromise) return indexesPromise;
  indexesPromise = Promise.all([
    locations().createIndex({ slug: 1 }, { unique: true }),
    locationStock().createIndex({ productId: 1, locationId: 1 }, { unique: true }),
    transfers().createIndex({ status: 1, createdAt: -1 }),
    transfers().createIndex({ toLocationId: 1, status: 1 }),
    transfers().createIndex({ fromLocationId: 1, status: 1 }),
  ]).catch((err) => {
    indexesPromise = null;
    throw err;
  });
  return indexesPromise;
}

async function loadSeededLocations() {
  const rows = await locations()
    .find({
      slug: {
        $in: [LOCATION_SLUGS.harare, LOCATION_SLUGS.gweru, LOCATION_SLUGS.inTransit],
      },
    })
    .toArray();
  const bySlug = Object.fromEntries(rows.map((row) => [row.slug, row]));
  return {
    harare: bySlug[LOCATION_SLUGS.harare] ?? null,
    gweru: bySlug[LOCATION_SLUGS.gweru] ?? null,
    inTransit: bySlug[LOCATION_SLUGS.inTransit] ?? null,
  };
}

function cachedResult(seeded) {
  return {
    harare: serializeLocation(seeded.harare),
    gweru: serializeLocation(seeded.gweru),
    inTransit: serializeLocation(seeded.inTransit),
  };
}

/**
 * Seed Harare (hub), Gweru (branch), and In transit (system).
 * Migrate product.stock → Harare, backfill sales/expenses, assign attendants.
 *
 * Fast path: after the first successful run (per warm instance + app_meta flag),
 * this is a no-op so admin layouts stay cheap on Vercel.
 */
export async function ensureLocationsMigrated() {
  await ensureMongoConnected();

  if (globalLoc._stocklyLocationsReady) {
    await ensureCurrencyBackfill();
    return globalLoc._stocklyLocationsReady;
  }

  // Cheap readiness check — one meta read, or three location finds on first deploy.
  const readyMeta = await meta().findOne({ _id: LOCATION_MIGRATION_KEY });
  if (readyMeta?.done) {
    const seeded = await loadSeededLocations();
    if (seeded.harare && seeded.gweru && seeded.inTransit) {
      const result = cachedResult(seeded);
      globalLoc._stocklyLocationsReady = result;
      return result;
    }
  }

  await ensureLocationIndexes();
  const now = new Date();

  const upsertLocation = async ({ name, slug, isHub = false, isSystem = false }) => {
    const existing = await locations().findOne({ slug });
    if (existing) {
      // Avoid write+re-read on every ensure when already seeded.
      const needsUpdate =
        existing.name !== name ||
        Boolean(existing.isHub) !== isHub ||
        Boolean(existing.isSystem) !== isSystem;
      if (!needsUpdate) return existing;
      await locations().updateOne(
        { _id: existing._id },
        {
          $set: {
            name,
            isHub,
            isSystem,
            updatedAt: now,
          },
        },
      );
      return { ...existing, name, isHub, isSystem, updatedAt: now };
    }
    const { insertedId } = await locations().insertOne({
      name,
      slug,
      isHub,
      isSystem,
      currency: DEFAULT_CURRENCY,
      supplyHubId: null,
      createdAt: now,
      updatedAt: now,
    });
    return locations().findOne({ _id: insertedId });
  };

  const harare = await upsertLocation({
    name: "Harare",
    slug: LOCATION_SLUGS.harare,
    isHub: true,
  });
  const gweru = await upsertLocation({
    name: "Gweru",
    slug: LOCATION_SLUGS.gweru,
    isHub: false,
  });
  const inTransit = await upsertLocation({
    name: "In transit",
    slug: LOCATION_SLUGS.inTransit,
    isSystem: true,
  });

  // Only migrate products that have no location_stock rows yet (bulk, not N+1).
  const productRows = await products().find({}).project({ name: 1, stock: 1 }).toArray();
  if (productRows.length > 0) {
    const existingStock = await locationStock()
      .find({ productId: { $in: productRows.map((p) => p._id) } })
      .project({ productId: 1 })
      .toArray();
    const hasStock = new Set(existingStock.map((row) => String(row.productId)));
    const toInsert = [];
    for (const product of productRows) {
      if (hasStock.has(String(product._id))) continue;
      const qty = Math.max(0, Number(product.stock) || 0);
      toInsert.push({
        productId: product._id,
        locationId: harare._id,
        quantity: qty,
        updatedAt: now,
      });
    }
    if (toInsert.length > 0) {
      await locationStock().insertMany(toInsert, { ordered: false });
      // Sync denormalized totals only for newly migrated products.
      await Promise.all(toInsert.map((row) => syncProductStockTotal(row.productId)));
    }
  }

  // Backfill sales / expenses without location → Harare.
  await sales().updateMany(
    {
      $or: [{ locationId: { $exists: false } }, { locationId: null }],
    },
    {
      $set: {
        locationId: harare._id,
        locationName: harare.name,
      },
    },
  );
  await expenses().updateMany(
    {
      $or: [{ locationId: { $exists: false } }, { locationId: null }],
    },
    {
      $set: {
        locationId: harare._id,
        locationName: harare.name,
      },
    },
  );

  // Assign attendants (role user) without locationId → Harare.
  await users().updateMany(
    {
      role: "user",
      $or: [{ locationId: { $exists: false } }, { locationId: null }, { locationId: "" }],
    },
    {
      $set: {
        locationId: String(harare._id),
        locationName: harare.name,
      },
    },
  );

  await meta().updateOne(
    { _id: LOCATION_MIGRATION_KEY },
    { $set: { done: true, updatedAt: now } },
    { upsert: true },
  );

  const result = {
    harare: serializeLocation(harare),
    gweru: serializeLocation(gweru),
    inTransit: serializeLocation(inTransit),
  };
  globalLoc._stocklyLocationsReady = result;
  await ensureCurrencyBackfill();
  return result;
}

/** USD on existing shops, Gweru supplied by Harare, sales/expenses tagged USD. */
async function ensureCurrencyBackfill() {
  if (globalLoc._stocklyCurrencyReady) return;
  const flag = await meta().findOne({ _id: CURRENCY_MIGRATION_KEY });
  if (flag?.done) {
    globalLoc._stocklyCurrencyReady = true;
    return;
  }

  const seeded = await loadSeededLocations();
  if (!seeded.harare || !seeded.gweru) return;

  const now = new Date();
  await locations().updateMany(
    { $or: [{ currency: { $exists: false } }, { currency: null }, { currency: "" }] },
    { $set: { currency: DEFAULT_CURRENCY, updatedAt: now } },
  );
  await locations().updateOne(
    {
      _id: seeded.gweru._id,
      $or: [{ supplyHubId: { $exists: false } }, { supplyHubId: null }],
    },
    { $set: { supplyHubId: seeded.harare._id, updatedAt: now } },
  );
  await sales().updateMany(
    { $or: [{ currency: { $exists: false } }, { currency: null }, { currency: "" }] },
    { $set: { currency: DEFAULT_CURRENCY } },
  );
  await expenses().updateMany(
    { $or: [{ currency: { $exists: false } }, { currency: null }, { currency: "" }] },
    { $set: { currency: DEFAULT_CURRENCY } },
  );

  const unmarked = await products()
    .find({
      $or: [{ usualSource: { $exists: false } }, { usualSource: null }, { usualSource: "" }],
    })
    .project({ name: 1 })
    .toArray();
  const producedIds = [];
  const suppliedIds = [];
  for (const row of unmarked) {
    if (usualSourceForName(row.name) === USUAL_SOURCES.producedAtHarare) producedIds.push(row._id);
    else suppliedIds.push(row._id);
  }
  if (producedIds.length) {
    await products().updateMany(
      { _id: { $in: producedIds } },
      { $set: { usualSource: USUAL_SOURCES.producedAtHarare } },
    );
  }
  if (suppliedIds.length) {
    await products().updateMany(
      { _id: { $in: suppliedIds } },
      { $set: { usualSource: USUAL_SOURCES.fromJohannesburg } },
    );
  }

  await meta().updateOne(
    { _id: CURRENCY_MIGRATION_KEY },
    { $set: { done: true, updatedAt: now } },
    { upsert: true },
  );
  globalLoc._stocklyCurrencyReady = true;
}

export async function listSellableLocations() {
  await ensureLocationsMigrated();
  const rows = await locations()
    .find({ isSystem: { $ne: true } })
    .sort({ isHub: -1, name: 1 })
    .toArray();
  return rows.map(serializeLocation);
}

export async function listAllLocations({ includeSystem = false } = {}) {
  await ensureLocationsMigrated();
  const filter = includeSystem ? {} : { isSystem: { $ne: true } };
  const rows = await locations().find(filter).sort({ isHub: -1, name: 1 }).toArray();
  return rows.map(serializeLocation);
}

export async function getLocationById(id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const row = await locations().findOne({ _id });
  return row ? serializeLocation(row) : null;
}

export async function getLocationBySlug(slug) {
  const row = await locations().findOne({ slug: String(slug) });
  return row ? serializeLocation(row) : null;
}

export async function getHubLocation() {
  await ensureLocationsMigrated();
  const harare = await locations().findOne({ slug: LOCATION_SLUGS.harare });
  if (harare) return serializeLocation(harare);
  const row = await locations().findOne({ isHub: true, isSystem: { $ne: true } });
  return row ? serializeLocation(row) : null;
}

export async function createLocation({ name, currency, role, supplyHubId }) {
  await ensureLocationsMigrated();
  const trimmed = String(name ?? "").trim();
  const slug = slugifyLocationName(trimmed);
  if (!trimmed || !slug) return { ok: false, reason: "Name is required." };
  if (slug === LOCATION_SLUGS.inTransit) {
    return { ok: false, reason: "That name is reserved." };
  }
  const code = String(currency ?? "").trim().toUpperCase();
  if (!LOCATION_CURRENCIES.includes(code)) {
    return { ok: false, reason: "Choose USD or ZAR." };
  }
  const isHub = role === "hub";
  if (!isHub && role !== "branch") return { ok: false, reason: "Choose hub or branch." };

  let supplyOid = null;
  if (!isHub) {
    const hub = await getLocationById(supplyHubId);
    if (!hub || !hub.isHub || hub.isSystem) {
      return { ok: false, reason: "Choose the hub that supplies this branch." };
    }
    supplyOid = toObjectId(hub.id);
  }

  const taken = await locations().findOne({ slug });
  if (taken) return { ok: false, reason: "A location with that name already exists." };

  const now = new Date();
  const { insertedId } = await locations().insertOne({
    name: trimmed,
    slug,
    isHub,
    isSystem: false,
    currency: code,
    supplyHubId: supplyOid,
    createdAt: now,
    updatedAt: now,
  });
  return { ok: true, location: await getLocationById(insertedId) };
}

export async function updateLocationCurrency(id, currency) {
  const code = String(currency ?? "").trim().toUpperCase();
  if (!LOCATION_CURRENCIES.includes(code)) {
    return { ok: false, reason: "Choose USD or ZAR." };
  }
  const location = await getLocationById(id);
  if (!location || location.isSystem) return { ok: false, reason: "Location not found." };
  if (location.currency === code) return { ok: true, location };

  const lid = toObjectId(location.id);
  const [saleCount, expenseCount] = await Promise.all([
    sales().countDocuments({ locationId: lid }),
    expenses().countDocuments({ locationId: lid }),
  ]);
  if (saleCount > 0 || expenseCount > 0) {
    return {
      ok: false,
      reason: "Currency is locked after this shop has a sale or expense.",
    };
  }
  await locations().updateOne(
    { _id: lid },
    { $set: { currency: code, updatedAt: new Date() } },
  );
  return { ok: true, location: await getLocationById(id) };
}

export async function listAttendantsGrouped() {
  await ensureLocationsMigrated();
  const rows = await users()
    .find({ role: { $ne: "admin" } })
    .project({ name: 1, email: 1, locationId: 1 })
    .toArray();
  const grouped = {};
  for (const row of rows) {
    const key = row.locationId ? String(row.locationId) : "";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push({
      id: String(row._id),
      name: row.name || row.email || "Attendant",
    });
  }
  return grouped;
}

export async function getInTransitLocation() {
  await ensureLocationsMigrated();
  const row = await locations().findOne({ slug: LOCATION_SLUGS.inTransit });
  return row ? serializeLocation(row) : null;
}

export async function renameLocation(id, name) {
  const _id = toObjectId(id);
  const trimmed = String(name ?? "").trim();
  if (!_id || !trimmed) return { ok: false, reason: "Name is required." };
  const row = await locations().findOne({ _id });
  if (!row) return { ok: false, reason: "Location not found." };
  if (row.isSystem) return { ok: false, reason: "System locations cannot be renamed." };
  await locations().updateOne(
    { _id },
    { $set: { name: trimmed, updatedAt: new Date() } },
  );
  await users().updateMany(
    { locationId: String(_id) },
    { $set: { locationName: trimmed } },
  );
  return { ok: true, location: await getLocationById(id) };
}

export async function assignUserLocation(userId, locationId) {
  const uid = String(userId ?? "").trim();
  if (!uid) return { ok: false, reason: "User is required." };
  const location = await getLocationById(locationId);
  if (!location || location.isSystem) {
    return { ok: false, reason: "Choose a valid branch." };
  }
  const result = await users().updateOne(
    { _id: uid },
    { $set: { locationId: location.id, locationName: location.name } },
  );
  // Better Auth may store _id as string or ObjectId depending on adapter version.
  if (result.matchedCount === 0) {
    const asOid = toObjectId(uid);
    if (asOid) {
      await users().updateOne(
        { _id: asOid },
        { $set: { locationId: location.id, locationName: location.name } },
      );
    }
  }
  return { ok: true, location };
}

export async function getUserLocationId(user) {
  if (!user) return null;
  const fromSession = user.locationId ? String(user.locationId) : null;
  if (fromSession) return fromSession;
  const uid = String(user.id ?? user._id ?? "").trim();
  if (!uid) return null;
  let row = await users().findOne({ _id: uid });
  if (!row) {
    const asOid = toObjectId(uid);
    if (asOid) row = await users().findOne({ _id: asOid });
  }
  return row?.locationId ? String(row.locationId) : null;
}

export async function requireUserLocation(user) {
  await ensureLocationsMigrated();
  const locationId = await getUserLocationId(user);
  if (!locationId) {
    return {
      ok: false,
      reason: "Your account has no branch assigned. Ask an admin to assign you to Harare or Gweru.",
    };
  }
  const location = await getLocationById(locationId);
  if (!location || location.isSystem) {
    return {
      ok: false,
      reason: "Your branch assignment is invalid. Ask an admin to reassign you.",
    };
  }
  return { ok: true, location };
}

export async function getLocationStock(productId, locationId) {
  const pid = toObjectId(productId);
  const lid = toObjectId(locationId);
  if (!pid || !lid) return 0;
  const row = await locationStock().findOne({ productId: pid, locationId: lid });
  return Math.max(0, Number(row?.quantity) || 0);
}

export async function listLocationStockForLocation(locationId) {
  const lid = toObjectId(locationId);
  if (!lid) return [];
  const rows = await locationStock()
    .aggregate([
      { $match: { locationId: lid } },
      {
        $lookup: {
          from: "product",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: { path: "$product", preserveNullAndEmptyArrays: false } },
      { $sort: { "product.name": 1 } },
    ])
    .toArray();
  return rows.map((row) => ({
    productId: String(row.productId),
    productName: row.product?.name ?? "—",
    quantity: Math.max(0, Number(row.quantity) || 0),
    retailPriceCents: row.product?.retailPriceCents ?? 0,
    categoryId: row.product?.categoryId ? String(row.product.categoryId) : null,
  }));
}

/** Recompute product.stock from the sum of all location_stock rows. */
export async function syncProductStockTotal(productId) {
  const pid = toObjectId(productId);
  if (!pid) return 0;
  const [agg] = await locationStock()
    .aggregate([
      { $match: { productId: pid } },
      { $group: { _id: null, total: { $sum: "$quantity" } } },
    ])
    .toArray();
  const total = Math.max(0, Number(agg?.total) || 0);
  await products().updateOne(
    { _id: pid },
    { $set: { stock: total, updatedAt: new Date() } },
  );
  return total;
}

/**
 * Atomically change stock at one location and sync product.stock.
 * Returns { ok, stockAfterLocation, stockAfterProduct, reason? }.
 */
/**
 * Change on-hand at a location and keep product.stock in sync.
 * Set skipMovement=true when the caller writes its own stock_movement row
 * (sales/voids/receives already have specialized movement + month rollup paths).
 */
export async function adjustLocationStock({
  productId,
  locationId,
  delta,
  type,
  actor,
  reason,
  at = new Date(),
  transferId = null,
  refType = "product",
  refId = null,
  skipMovement = false,
}) {
  const pid = toObjectId(productId);
  const lid = toObjectId(locationId);
  const qtyDelta = Number(delta);
  if (!pid || !lid) return { ok: false, reason: "Product or location not found." };
  if (!Number.isInteger(qtyDelta) || qtyDelta === 0) {
    return { ok: false, reason: "Quantity delta must be a non-zero whole number." };
  }

  const product = await products().findOne({ _id: pid });
  if (!product) return { ok: false, reason: "Product not found." };
  const location = await locations().findOne({ _id: lid });
  if (!location) return { ok: false, reason: "Location not found." };

  const now = at instanceof Date && !Number.isNaN(at.getTime()) ? at : new Date();

  if (qtyDelta < 0) {
    const updated = await locationStock().findOneAndUpdate(
      { productId: pid, locationId: lid, quantity: { $gte: -qtyDelta } },
      { $inc: { quantity: qtyDelta }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    if (!updated) {
      const row = await locationStock().findOne({ productId: pid, locationId: lid });
      const onHand = Math.max(0, Number(row?.quantity) || 0);
      return {
        ok: false,
        reason: `Not enough stock at ${location.name} for ${product.name} (have ${onHand}).`,
      };
    }
    const productTotal = await syncProductStockTotal(pid);
    if (!skipMovement) {
      await movements().insertOne({
        productId: pid,
        productName: product.name,
        type,
        quantityDelta: qtyDelta,
        stockAfter: productTotal,
        locationStockAfter: updated.quantity,
        locationId: lid,
        locationName: location.name,
        transferId: transferId ? String(transferId) : null,
        reason: String(reason ?? "").trim() || type,
        refType,
        refId: refId ?? String(pid),
        createdBy: actor?.id ?? null,
        createdByName: actor?.name ?? "Staff",
        createdAt: now,
      });
    }
    return {
      ok: true,
      stockAfterLocation: updated.quantity,
      stockAfterProduct: productTotal,
      product,
      location: serializeLocation(location),
    };
  }

  // Positive delta — upsert then increment.
  await locationStock().updateOne(
    { productId: pid, locationId: lid },
    {
      $inc: { quantity: qtyDelta },
      $set: { updatedAt: now },
      $setOnInsert: { productId: pid, locationId: lid },
    },
    { upsert: true },
  );
  const row = await locationStock().findOne({ productId: pid, locationId: lid });
  const productTotal = await syncProductStockTotal(pid);
  if (!skipMovement) {
    await movements().insertOne({
      productId: pid,
      productName: product.name,
      type,
      quantityDelta: qtyDelta,
      stockAfter: productTotal,
      locationStockAfter: row?.quantity ?? qtyDelta,
      locationId: lid,
      locationName: location.name,
      transferId: transferId ? String(transferId) : null,
      reason: String(reason ?? "").trim() || type,
      refType,
      refId: refId ?? String(pid),
      createdBy: actor?.id ?? null,
      createdByName: actor?.name ?? "Staff",
      createdAt: now,
    });
  }
  return {
    ok: true,
    stockAfterLocation: row?.quantity ?? qtyDelta,
    stockAfterProduct: productTotal,
    product,
    location: serializeLocation(location),
  };
}

function serializeTransfer(row) {
  if (!row) return null;
  const { _id, ...rest } = row;
  return {
    id: String(_id),
    ...rest,
    productId: rest.productId ? String(rest.productId) : null,
    fromLocationId: rest.fromLocationId ? String(rest.fromLocationId) : null,
    toLocationId: rest.toLocationId ? String(rest.toLocationId) : null,
    sentAt: rest.sentAt?.toISOString?.() ?? rest.sentAt ?? null,
    receivedAt: rest.receivedAt?.toISOString?.() ?? rest.receivedAt ?? null,
    cancelledAt: rest.cancelledAt?.toISOString?.() ?? rest.cancelledAt ?? null,
    createdAt: rest.createdAt?.toISOString?.() ?? rest.createdAt ?? null,
  };
}

/**
 * Send stock from one branch to another (typically Harare → Gweru).
 * Debits source, credits In transit, creates stock_transfer in_transit.
 */
export async function sendStockTransfer({
  productId,
  quantity,
  fromLocationId,
  toLocationId,
  actor,
  reason = "",
}) {
  await ensureLocationsMigrated();
  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) {
    return { ok: false, reason: "Quantity must be a whole number of at least 1." };
  }
  if (String(fromLocationId) === String(toLocationId)) {
    return { ok: false, reason: "Choose two different branches." };
  }

  const from = await getLocationById(fromLocationId);
  const to = await getLocationById(toLocationId);
  const transit = await getInTransitLocation();
  if (!from || from.isSystem || !to || to.isSystem || !transit) {
    return { ok: false, reason: "Choose valid source and destination branches." };
  }
  const shops = await listSellableLocations();
  if (!isTransferAllowed(from, to, shops)) {
    return { ok: false, reason: `${from.name} cannot send stock to ${to.name}.` };
  }

  const product = await products().findOne({ _id: toObjectId(productId) });
  if (!product) return { ok: false, reason: "Product not found." };

  const note = String(reason ?? "").trim() || `Transfer to ${to.name}`;
  const now = new Date();
  const transferId = new ObjectId();

  const debit = await adjustLocationStock({
    productId,
    locationId: from.id,
    delta: -qty,
    type: MOVEMENT_TYPE.transferOut,
    actor,
    reason: note,
    at: now,
    transferId,
    refType: "transfer",
    refId: String(transferId),
  });
  if (!debit.ok) return debit;

  const creditTransit = await adjustLocationStock({
    productId,
    locationId: transit.id,
    delta: qty,
    type: MOVEMENT_TYPE.transferOut,
    actor,
    reason: note,
    at: now,
    transferId,
    refType: "transfer",
    refId: String(transferId),
    skipMovement: true,
  });
  if (!creditTransit.ok) {
    // Compensate source.
    await adjustLocationStock({
      productId,
      locationId: from.id,
      delta: qty,
      type: MOVEMENT_TYPE.transferOut,
      actor,
      reason: "Transfer rollback",
      at: now,
      transferId,
      skipMovement: true,
    });
    return { ok: false, reason: creditTransit.reason || "Could not move stock into transit." };
  }

  await transfers().insertOne({
    _id: transferId,
    productId: product._id,
    productName: product.name,
    quantity: qty,
    fromLocationId: toObjectId(from.id),
    fromLocationName: from.name,
    toLocationId: toObjectId(to.id),
    toLocationName: to.name,
    status: TRANSFER_STATUS.inTransit,
    reason: note,
    sentBy: actor?.id ?? null,
    sentByName: actor?.name ?? "Staff",
    sentAt: now,
    receivedBy: null,
    receivedByName: null,
    receivedAt: null,
    cancelledBy: null,
    cancelledByName: null,
    cancelledAt: null,
    cancelReason: null,
    createdAt: now,
    updatedAt: now,
  });

  return { ok: true, transfer: serializeTransfer(await transfers().findOne({ _id: transferId })) };
}

export async function confirmStockTransfer({ transferId, actor }) {
  await ensureLocationsMigrated();
  const _id = toObjectId(transferId);
  if (!_id) return { ok: false, reason: "Transfer not found." };

  const transfer = await transfers().findOne({ _id });
  if (!transfer) return { ok: false, reason: "Transfer not found." };
  if (transfer.status !== TRANSFER_STATUS.inTransit) {
    return { ok: false, reason: "This transfer is no longer in transit." };
  }

  const transit = await getInTransitLocation();
  const to = await getLocationById(transfer.toLocationId);
  if (!transit || !to) return { ok: false, reason: "Location not found." };

  const now = new Date();
  const qty = Number(transfer.quantity) || 0;

  const debitTransit = await adjustLocationStock({
    productId: transfer.productId,
    locationId: transit.id,
    delta: -qty,
    type: MOVEMENT_TYPE.transferIn,
    actor,
    reason: `Received from ${transfer.fromLocationName}`,
    at: now,
    transferId: _id,
    refType: "transfer",
    refId: String(_id),
  });
  if (!debitTransit.ok) return debitTransit;

  const creditDest = await adjustLocationStock({
    productId: transfer.productId,
    locationId: to.id,
    delta: qty,
    type: MOVEMENT_TYPE.transferIn,
    actor,
    reason: `Received from ${transfer.fromLocationName}`,
    at: now,
    transferId: _id,
    refType: "transfer",
    refId: String(_id),
    skipMovement: true,
  });
  if (!creditDest.ok) {
    await adjustLocationStock({
      productId: transfer.productId,
      locationId: transit.id,
      delta: qty,
      type: MOVEMENT_TYPE.transferIn,
      actor,
      reason: "Confirm rollback",
      at: now,
      transferId: _id,
      skipMovement: true,
    });
    return creditDest;
  }

  // Write the destination movement explicitly (we skipped it above to avoid double type confusion).
  await movements().insertOne({
    productId: transfer.productId,
    productName: transfer.productName,
    type: MOVEMENT_TYPE.transferIn,
    quantityDelta: qty,
    stockAfter: creditDest.stockAfterProduct,
    locationStockAfter: creditDest.stockAfterLocation,
    locationId: toObjectId(to.id),
    locationName: to.name,
    fromLocationId: transfer.fromLocationId ? String(transfer.fromLocationId) : null,
    fromLocationName: transfer.fromLocationName ?? null,
    transferId: String(_id),
    reason: `Received from ${transfer.fromLocationName}`,
    refType: "transfer",
    refId: String(_id),
    createdBy: actor?.id ?? null,
    createdByName: actor?.name ?? "Staff",
    createdAt: now,
  });

  await transfers().updateOne(
    { _id },
    {
      $set: {
        status: TRANSFER_STATUS.completed,
        receivedBy: actor?.id ?? null,
        receivedByName: actor?.name ?? "Staff",
        receivedAt: now,
        updatedAt: now,
      },
    },
  );

  return { ok: true, transfer: serializeTransfer(await transfers().findOne({ _id })) };
}

export async function cancelStockTransfer({ transferId, actor, reason = "" }) {
  await ensureLocationsMigrated();
  const _id = toObjectId(transferId);
  if (!_id) return { ok: false, reason: "Transfer not found." };

  const transfer = await transfers().findOne({ _id });
  if (!transfer) return { ok: false, reason: "Transfer not found." };
  if (transfer.status !== TRANSFER_STATUS.inTransit) {
    return { ok: false, reason: "Only in-transit transfers can be cancelled." };
  }

  const transit = await getInTransitLocation();
  const from = await getLocationById(transfer.fromLocationId);
  if (!transit || !from) return { ok: false, reason: "Location not found." };

  const now = new Date();
  const qty = Number(transfer.quantity) || 0;
  const note = String(reason ?? "").trim() || "Transfer cancelled";

  const debitTransit = await adjustLocationStock({
    productId: transfer.productId,
    locationId: transit.id,
    delta: -qty,
    type: MOVEMENT_TYPE.transferOut,
    actor,
    reason: note,
    at: now,
    transferId: _id,
    refType: "transfer",
    refId: String(_id),
  });
  if (!debitTransit.ok) return debitTransit;

  const creditFrom = await adjustLocationStock({
    productId: transfer.productId,
    locationId: from.id,
    delta: qty,
    type: MOVEMENT_TYPE.transferOut,
    actor,
    reason: note,
    at: now,
    transferId: _id,
    refType: "transfer",
    refId: String(_id),
  });
  if (!creditFrom.ok) {
    await adjustLocationStock({
      productId: transfer.productId,
      locationId: transit.id,
      delta: qty,
      type: MOVEMENT_TYPE.transferOut,
      actor,
      reason: "Cancel rollback",
      at: now,
      transferId: _id,
      skipMovement: true,
    });
    return creditFrom;
  }

  await transfers().updateOne(
    { _id },
    {
      $set: {
        status: TRANSFER_STATUS.cancelled,
        cancelledBy: actor?.id ?? null,
        cancelledByName: actor?.name ?? "Staff",
        cancelledAt: now,
        cancelReason: note,
        updatedAt: now,
      },
    },
  );

  return { ok: true, transfer: serializeTransfer(await transfers().findOne({ _id })) };
}

export async function listStockTransfers({
  status = null,
  locationId = null,
  limit = 50,
} = {}) {
  await ensureLocationsMigrated();
  const filter = {};
  if (status) filter.status = status;
  if (locationId) {
    const lid = toObjectId(locationId);
    if (lid) {
      filter.$or = [{ fromLocationId: lid }, { toLocationId: lid }];
    }
  }
  const rows = await transfers()
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(serializeTransfer);
}

export async function listOpenTransfersTo(locationId) {
  return listStockTransfers({
    status: TRANSFER_STATUS.inTransit,
    locationId,
    limit: 100,
  }).then((rows) =>
    rows.filter((row) => String(row.toLocationId) === String(locationId)),
  );
}

/** Integrity helpers for transfers. */
export async function getTransferIntegritySnapshot() {
  await ensureLocationsMigrated();
  const open = await listStockTransfers({ status: TRANSFER_STATUS.inTransit, limit: 200 });
  const completed = await transfers()
    .find({ status: TRANSFER_STATUS.completed })
    .project({ _id: 1 })
    .limit(500)
    .toArray();

  const mismatches = [];
  for (const row of completed.slice(0, 100)) {
    const outs = await movements()
      .find({ transferId: String(row._id), type: MOVEMENT_TYPE.transferOut, quantityDelta: { $lt: 0 } })
      .toArray();
    const ins = await movements()
      .find({ transferId: String(row._id), type: MOVEMENT_TYPE.transferIn, quantityDelta: { $gt: 0 } })
      .toArray();
    const outQty = outs.reduce((s, m) => s + Math.abs(Number(m.quantityDelta) || 0), 0);
    const inQty = ins.reduce((s, m) => s + Math.abs(Number(m.quantityDelta) || 0), 0);
    // Out also includes cancel paths; for completed, expect matching in.
    if (inQty > 0 && outQty > 0 && inQty !== outQty) {
      mismatches.push({
        transferId: String(row._id),
        outQty,
        inQty,
      });
    }
  }

  return {
    openCount: open.length,
    openTransfers: open,
    mismatchCount: mismatches.length,
    mismatches,
  };
}

/** Units produced at Harare versus units received from Johannesburg. */
export async function harareSourceSnapshot() {
  await ensureLocationsMigrated();
  const harare = await getLocationBySlug(LOCATION_SLUGS.harare);
  const johannesburg = await getLocationBySlug("johannesburg");
  if (!harare) return [];

  const receiveRows = await movements()
    .find({ type: MOVEMENT_TYPE.receive, locationId: toObjectId(harare.id) })
    .project({ productId: 1, productName: 1, locationId: 1, sourceKind: 1, quantityDelta: 1, type: 1 })
    .toArray();
  const transferRows = johannesburg
    ? await transfers()
        .find({
          status: TRANSFER_STATUS.completed,
          toLocationId: toObjectId(harare.id),
          fromLocationId: toObjectId(johannesburg.id),
        })
        .project({ productId: 1, productName: 1, toLocationId: 1, fromLocationId: 1, quantity: 1, status: 1 })
        .toArray()
    : [];

  return harareInboundTotals({
    receives: receiveRows.map((row) => ({
      ...row,
      productId: String(row.productId),
      locationId: String(row.locationId),
    })),
    transfers: transferRows.map((row) => ({
      ...row,
      productId: String(row.productId),
      toLocationId: String(row.toLocationId),
      fromLocationId: String(row.fromLocationId),
    })),
    harareId: harare.id,
    johannesburgId: johannesburg?.id ?? "",
  });
}
