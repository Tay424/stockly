import "server-only";

import { ObjectId } from "mongodb";

import { db } from "./db.js";
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

export function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

function serializeLocation({ _id, ...rest }) {
  return { id: String(_id), ...rest };
}

export async function ensureLocationIndexes() {
  await Promise.all([
    locations().createIndex({ slug: 1 }, { unique: true }),
    locationStock().createIndex({ productId: 1, locationId: 1 }, { unique: true }),
    transfers().createIndex({ status: 1, createdAt: -1 }),
    transfers().createIndex({ toLocationId: 1, status: 1 }),
    transfers().createIndex({ fromLocationId: 1, status: 1 }),
  ]);
}

/**
 * Seed Harare (hub), Gweru (branch), and In transit (system).
 * Migrate product.stock → Harare, backfill sales/expenses, assign attendants.
 */
export async function ensureLocationsMigrated() {
  await ensureLocationIndexes();
  const now = new Date();

  const upsertLocation = async ({ name, slug, isHub = false, isSystem = false }) => {
    const existing = await locations().findOne({ slug });
    if (existing) {
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
      return locations().findOne({ _id: existing._id });
    }
    const { insertedId } = await locations().insertOne({
      name,
      slug,
      isHub,
      isSystem,
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

  // Move product.stock into Harare location_stock when no rows exist yet for that product.
  const productRows = await products().find({}).project({ name: 1, stock: 1 }).toArray();
  for (const product of productRows) {
    const existing = await locationStock().findOne({
      productId: product._id,
      locationId: harare._id,
    });
    if (existing) continue;

    const anyRow = await locationStock().findOne({ productId: product._id });
    if (anyRow) continue;

    const qty = Math.max(0, Number(product.stock) || 0);
    await locationStock().insertOne({
      productId: product._id,
      locationId: harare._id,
      quantity: qty,
      updatedAt: now,
    });
  }

  // Sync product.stock = sum of location_stock for every product.
  for (const product of productRows) {
    await syncProductStockTotal(product._id);
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

  return {
    harare: serializeLocation(harare),
    gweru: serializeLocation(gweru),
    inTransit: serializeLocation(inTransit),
  };
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
  const row = await locations().findOne({ isHub: true, isSystem: { $ne: true } });
  return row ? serializeLocation(row) : null;
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
