import "server-only";

import { ObjectId } from "mongodb";

import { db } from "./db.js";
import { priceReceipt, saleProductSummary, saleStockLines } from "./pricing.js";
import { normalizePhone, upsertDistributor } from "./distributors.js";
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  MOVEMENT_TYPE,
  SALE_STATUS,
  effectiveSaleStatus,
  endOfLocalDay,
  findDiscrepancies,
  isSameLocalDay,
  startOfLocalDay,
} from "./stock-ledger.js";
import {
  ensureMonthOpeningForProduct,
  syncMonthAfterStockChange,
} from "./inventory.js";

const categories = () => db.collection("category");
const products = () => db.collection("product");
const sales = () => db.collection("sale");
const movements = () => db.collection("stock_movement");

const serialize = ({ _id, ...rest }) => ({ id: String(_id), ...rest });

export function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export async function listCategories() {
  const rows = await categories().find({}).sort({ name: 1 }).toArray();
  return rows.map(({ _id, ...rest }) => ({
    id: String(_id),
    ...rest,
    wholesalePackQty: rest.wholesalePackQty ?? 0,
    wholesalePackPriceCents: rest.wholesalePackPriceCents ?? 0,
  }));
}

export async function createCategory({
  name,
  description,
  wholesalePackQty = 0,
  wholesalePackPriceCents = 0,
}) {
  const now = new Date();
  await categories().insertOne({
    name,
    description,
    wholesalePackQty: Number(wholesalePackQty) || 0,
    wholesalePackPriceCents: Number(wholesalePackPriceCents) || 0,
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateCategory(
  id,
  { name, description, wholesalePackQty = 0, wholesalePackPriceCents = 0 },
) {
  const _id = toObjectId(id);
  if (!_id) return false;
  const res = await categories().updateOne(
    { _id },
    {
      $set: {
        name,
        description,
        wholesalePackQty: Number(wholesalePackQty) || 0,
        wholesalePackPriceCents: Number(wholesalePackPriceCents) || 0,
        updatedAt: new Date(),
      },
    },
  );
  return res.matchedCount === 1;
}

export async function deleteCategory(id) {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, reason: "Category not found." };
  const inUse = await products().countDocuments({ categoryId: _id }, { limit: 1 });
  if (inUse) return { ok: false, reason: "That category still has products in it." };
  await categories().deleteOne({ _id });
  return { ok: true };
}

/** Products with their category name resolved, newest first. */
export async function listProducts() {
  const rows = await products()
    .aggregate([
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: "category",
          localField: "categoryId",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: true } },
    ])
    .toArray();

  return rows.map(({ _id, categoryId, category, ...rest }) => ({
    id: String(_id),
    categoryId: categoryId ? String(categoryId) : null,
    categoryName: category?.name ?? null,
    ...rest,
    lowStockThreshold:
      typeof rest.lowStockThreshold === "number" && Number.isInteger(rest.lowStockThreshold)
        ? rest.lowStockThreshold
        : DEFAULT_LOW_STOCK_THRESHOLD,
    discountStartsAt: rest.discountStartsAt?.toISOString() ?? null,
    discountEndsAt: rest.discountEndsAt?.toISOString() ?? null,
  }));
}

async function insertMovement(doc) {
  const now = doc.createdAt ?? new Date();
  const { insertedId } = await movements().insertOne({ ...doc, createdAt: now });
  return insertedId;
}

/**
 * Creates a product. Initial stock > 0 writes an admin_adjust movement — stock
 * never changes silently. Product wholesale tiers are not stored; packs live on
 * the category.
 */
export async function createProduct(fields, { actor, stockReason } = {}) {
  const now = new Date();
  const stock = fields.stock ?? 0;
  const {
    wholesalePriceCents: _wp,
    wholesaleMinQty: _wm,
    ...safeFields
  } = fields;
  if (
    typeof safeFields.lowStockThreshold !== "number" ||
    !Number.isInteger(safeFields.lowStockThreshold) ||
    safeFields.lowStockThreshold < 0
  ) {
    safeFields.lowStockThreshold = DEFAULT_LOW_STOCK_THRESHOLD;
  }
  const { insertedId } = await products().insertOne({
    ...safeFields,
    categoryId: toObjectId(safeFields.categoryId),
    createdAt: now,
    updatedAt: now,
  });

  if (stock > 0) {
    const reason = String(stockReason ?? "").trim() || "Initial stock";
    const productDoc = {
      _id: insertedId,
      name: safeFields.name,
      stock: 0,
    };
    await ensureMonthOpeningForProduct(productDoc, undefined);
    await insertMovement({
      productId: insertedId,
      productName: safeFields.name,
      type: MOVEMENT_TYPE.adminAdjust,
      quantityDelta: stock,
      stockAfter: stock,
      reason,
      refType: "product",
      refId: String(insertedId),
      createdBy: actor?.id ?? null,
      createdByName: actor?.name ?? "Admin",
      createdAt: now,
    });
    await syncMonthAfterStockChange({
      product: { _id: insertedId, name: safeFields.name },
      previousStock: 0,
      nextStock: stock,
      type: MOVEMENT_TYPE.adminAdjust,
      quantityDelta: stock,
      at: now,
    });
  }

  return String(insertedId);
}

/**
 * Updates product fields. When stock changes, `stockReason` is required and a
 * ledger row is written. Non-stock edits do not touch the ledger. Product
 * wholesale tier fields are stripped — packs live on the category.
 */
export async function updateProduct(id, fields, { actor, stockReason } = {}) {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, reason: "Product not found." };

  const existing = await products().findOne({ _id });
  if (!existing) return { ok: false, reason: "Product not found." };

  const {
    wholesalePriceCents: _wp,
    wholesaleMinQty: _wm,
    ...safeFields
  } = fields;

  if (
    safeFields.lowStockThreshold !== undefined &&
    (typeof safeFields.lowStockThreshold !== "number" ||
      !Number.isInteger(safeFields.lowStockThreshold) ||
      safeFields.lowStockThreshold < 0)
  ) {
    safeFields.lowStockThreshold = existing.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  }

  const nextStock = safeFields.stock;
  const stockChanged =
    typeof nextStock === "number" && Number.isInteger(nextStock) && nextStock !== existing.stock;

  if (stockChanged) {
    const reason = String(stockReason ?? "").trim();
    if (!reason) {
      return { ok: false, reason: "A reason is required when changing stock." };
    }
  }

  const res = await products().updateOne(
    { _id },
    {
      $set: {
        ...safeFields,
        categoryId: toObjectId(safeFields.categoryId),
        updatedAt: new Date(),
      },
    },
  );
  if (res.matchedCount !== 1) return { ok: false, reason: "Product not found." };

  if (stockChanged) {
    const delta = nextStock - existing.stock;
    const now = new Date();
    await ensureMonthOpeningForProduct(existing);
    await insertMovement({
      productId: _id,
      productName: safeFields.name ?? existing.name,
      type: MOVEMENT_TYPE.adminAdjust,
      quantityDelta: delta,
      stockAfter: nextStock,
      reason: String(stockReason).trim(),
      refType: "product",
      refId: String(_id),
      createdBy: actor?.id ?? null,
      createdByName: actor?.name ?? "Admin",
      createdAt: now,
    });
    await syncMonthAfterStockChange({
      product: existing,
      previousStock: existing.stock,
      nextStock,
      type: MOVEMENT_TYPE.adminAdjust,
      quantityDelta: delta,
      at: now,
    });
  }

  return { ok: true };
}

export async function deleteProduct(id) {
  const _id = toObjectId(id);
  if (!_id) return false;
  const res = await products().deleteOne({ _id });
  return res.deletedCount === 1;
}

const serializeSale = ({ _id, productId, soldBy, distributorId, lines, packs, retailLines, ...rest }) => ({
  id: String(_id),
  productId: productId ? String(productId) : null,
  soldBy: soldBy ? String(soldBy) : null,
  distributorId: distributorId ? String(distributorId) : null,
  lines: Array.isArray(lines)
    ? lines.map((line) => ({
        ...line,
        productId: line.productId ? String(line.productId) : null,
        categoryId: line.categoryId ? String(line.categoryId) : null,
      }))
    : undefined,
  packs: Array.isArray(packs)
    ? packs.map((pack) => ({
        ...pack,
        categoryId: pack.categoryId ? String(pack.categoryId) : null,
        contributions: Array.isArray(pack.contributions)
          ? pack.contributions.map((c) => ({
              ...c,
              productId: c.productId ? String(c.productId) : null,
            }))
          : [],
      }))
    : undefined,
  retailLines: Array.isArray(retailLines)
    ? retailLines.map((line) => ({
        ...line,
        productId: line.productId ? String(line.productId) : null,
        categoryId: line.categoryId ? String(line.categoryId) : null,
      }))
    : undefined,
  ...rest,
  status: rest.status || SALE_STATUS.recorded,
  createdAt: rest.createdAt?.toISOString() ?? null,
  voidRequestedAt: rest.voidRequestedAt?.toISOString() ?? null,
  voidedAt: rest.voidedAt?.toISOString() ?? null,
});

const serializeMovement = ({ _id, productId, ...rest }) => ({
  id: String(_id),
  productId: productId ? String(productId) : null,
  ...rest,
  refId: rest.refId != null ? String(rest.refId) : null,
  createdAt: rest.createdAt?.toISOString() ?? null,
});

/**
 * Every sale, newest first. Product and seller names are stored on the sale
 * itself so the ledger still reads correctly after a rename or delete.
 */
export async function listSales() {
  const rows = await sales().find({}).sort({ createdAt: -1 }).toArray();
  return rows.map(serializeSale);
}

export async function listSalesBySeller(userId, limit = 20, { sinceHours = null } = {}) {
  const filter = { soldBy: userId };
  if (sinceHours != null && Number(sinceHours) > 0) {
    const since = new Date(Date.now() - Number(sinceHours) * 60 * 60 * 1000);
    filter.createdAt = { $gte: since };
  }
  const rows = await sales()
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(serializeSale);
}

export async function getSaleById(id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const row = await sales().findOne({ _id });
  return row ? serializeSale(row) : null;
}

export async function listPendingVoidRequests() {
  const rows = await sales()
    .find({ status: SALE_STATUS.voidRequested })
    .sort({ voidRequestedAt: -1 })
    .toArray();
  return rows.map(serializeSale);
}

/** Products a seller can pick from — in stock, categorized, newest name first. */
export async function listSellableProducts() {
  const rows = await products()
    .aggregate([
      {
        $match: {
          stock: { $gt: 0 },
          categoryId: { $exists: true, $ne: null },
        },
      },
      { $sort: { name: 1 } },
      {
        $lookup: {
          from: "category",
          localField: "categoryId",
          foreignField: "_id",
          as: "category",
        },
      },
      { $unwind: { path: "$category", preserveNullAndEmptyArrays: false } },
    ])
    .toArray();

  return rows.map(({ _id, categoryId, category, ...rest }) => ({
    id: String(_id),
    categoryId: String(categoryId),
    categoryName: category?.name ?? null,
    wholesalePackQty: category?.wholesalePackQty ?? 0,
    wholesalePackPriceCents: category?.wholesalePackPriceCents ?? 0,
    ...rest,
    discountStartsAt: rest.discountStartsAt?.toISOString() ?? null,
    discountEndsAt: rest.discountEndsAt?.toISOString() ?? null,
  }));
}

export async function findProductById(id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const row = await products().findOne({ _id });
  return row ? serialize(row) : null;
}

export async function listStockMovements({ since, until, limit = 500 } = {}) {
  const filter = {};
  if (since || until) {
    filter.createdAt = {};
    if (since) filter.createdAt.$gte = since;
    if (until) filter.createdAt.$lt = until;
  }
  const rows = await movements()
    .find(filter)
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(serializeMovement);
}

/**
 * Decrements stock, writes the sale (status recorded), and a sale movement.
 * The `stock: { $gte: qty }` filter is what makes it safe: two sellers hitting
 * the last unit at the same time means one update matches and the other
 * returns null, so we can never oversell. Prices are snapshotted onto the sale
 * so the ledger stays truthful after a price change.
 */
export async function recordSale({ productId, quantity, sale }) {
  const _id = toObjectId(productId);
  if (!_id) return { ok: false, reason: "Product not found." };

  const now = new Date();
  const updated = await products().findOneAndUpdate(
    { _id, stock: { $gte: quantity } },
    { $inc: { stock: -quantity }, $set: { updatedAt: now } },
    { returnDocument: "after" },
  );

  if (!updated) {
    const exists = await products().countDocuments({ _id }, { limit: 1 });
    return {
      ok: false,
      reason: exists ? "Not enough stock left for that quantity." : "Product not found.",
    };
  }

  const { insertedId } = await sales().insertOne({
    ...sale,
    productId: _id,
    status: SALE_STATUS.recorded,
    createdAt: now,
  });

  await insertMovement({
    productId: _id,
    productName: sale.productName,
    type: MOVEMENT_TYPE.sale,
    quantityDelta: -quantity,
    stockAfter: updated.stock,
    reason: "Sale",
    refType: "sale",
    refId: String(insertedId),
    createdBy: sale.soldBy ?? null,
    createdByName: sale.soldByName ?? null,
    createdAt: now,
  });

  const previousStock = updated.stock + quantity;
  await syncMonthAfterStockChange({
    product: updated,
    previousStock,
    nextStock: updated.stock,
    type: MOVEMENT_TYPE.sale,
    quantityDelta: -quantity,
    at: now,
  });

  return { ok: true, stockLeft: updated.stock, saleId: String(insertedId) };
}

/**
 * Multi-line receipt sale: category packs + retail leftovers, one sale doc,
 * one stock movement per product line. Prices are always recomputed server-side.
 *
 * `cartLines`: [{ productId, quantity }]
 * `saleMeta`: { soldBy, soldByName }
 * `client`: { name, phone } — required by the action layer when wholesale
 */
export async function recordSaleReceipt({ cartLines, saleMeta, client = null }) {
  const ids = [
    ...new Set(
      (cartLines ?? [])
        .map((line) => String(line?.productId ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length === 0) return { ok: false, reason: "Add at least one product to the receipt." };

  const objectIds = ids.map(toObjectId).filter(Boolean);
  if (objectIds.length !== ids.length) {
    return { ok: false, reason: "One or more products were not found." };
  }

  const productRows = await products().find({ _id: { $in: objectIds } }).toArray();
  if (productRows.length !== ids.length) {
    return { ok: false, reason: "One or more products were not found." };
  }

  const productsById = new Map(
    productRows.map((row) => [
      String(row._id),
      {
        ...row,
        id: String(row._id),
        categoryId: row.categoryId ? String(row.categoryId) : null,
      },
    ]),
  );

  const categoryObjectIds = [
    ...new Set(
      productRows
        .map((row) => row.categoryId)
        .filter(Boolean)
        .map((id) => String(id)),
    ),
  ]
    .map(toObjectId)
    .filter(Boolean);

  const categoryRows =
    categoryObjectIds.length > 0
      ? await categories().find({ _id: { $in: categoryObjectIds } }).toArray()
      : [];
  const categoriesById = new Map(
    categoryRows.map((row) => [
      String(row._id),
      {
        ...row,
        id: String(row._id),
        wholesalePackQty: row.wholesalePackQty ?? 0,
        wholesalePackPriceCents: row.wholesalePackPriceCents ?? 0,
      },
    ]),
  );

  const priced = priceReceipt(cartLines, productsById, categoriesById);
  if (!priced.ok) return { ok: false, reason: priced.reason };

  let clientName = null;
  let clientPhone = null;
  let distributorObjectId = null;

  const clientTrimmedName = String(client?.name ?? "").trim();
  const clientRawPhone = client?.phone ?? "";

  if (priced.wholesale) {
    const upserted = await upsertDistributor({
      name: clientTrimmedName,
      phone: clientRawPhone,
      bumpSale: true,
    });
    if (!upserted.ok) return { ok: false, reason: upserted.reason };
    clientName = upserted.distributor.name;
    clientPhone = upserted.distributor.phone;
    distributorObjectId = toObjectId(upserted.distributor.id);
  } else if (clientTrimmedName) {
    // Retail CRM: name+phone → directory upsert; name only → sale snapshot.
    const phone = normalizePhone(clientRawPhone);
    if (phone) {
      const upserted = await upsertDistributor({
        name: clientTrimmedName,
        phone,
        bumpSale: true,
      });
      if (!upserted.ok) return { ok: false, reason: upserted.reason };
      clientName = upserted.distributor.name;
      clientPhone = upserted.distributor.phone;
      distributorObjectId = toObjectId(upserted.distributor.id);
    } else {
      clientName = clientTrimmedName;
      clientPhone = null;
    }
  }

  // Pre-check stock so we rarely need compensation.
  for (const line of priced.stockLines) {
    const product = productsById.get(line.productId);
    if (!product || product.stock < line.quantity) {
      return {
        ok: false,
        reason: `Not enough stock left for ${line.productName}.`,
      };
    }
  }

  const now = new Date();
  const decremented = [];

  for (const line of priced.stockLines) {
    const _id = toObjectId(line.productId);
    const updated = await products().findOneAndUpdate(
      { _id, stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    if (!updated) {
      // Compensate prior successful decrements.
      for (const prior of decremented) {
        await products().updateOne(
          { _id: prior._id },
          { $inc: { stock: prior.quantity }, $set: { updatedAt: now } },
        );
      }
      return {
        ok: false,
        reason: `Not enough stock left for ${line.productName}.`,
      };
    }
    decremented.push({ _id, quantity: line.quantity, stockAfter: updated.stock, line });
  }

  const first = priced.stockLines[0];
  const firstProductId = toObjectId(first.productId);
  const linesForDb = priced.stockLines.map((line) => ({
    ...line,
    productId: toObjectId(line.productId),
    categoryId: toObjectId(line.categoryId),
  }));
  const packsForDb = priced.packs.map((pack) => ({
    ...pack,
    categoryId: toObjectId(pack.categoryId),
    contributions: pack.contributions.map((c) => ({
      ...c,
      productId: toObjectId(c.productId),
    })),
  }));
  const retailForDb = priced.retailLines.map((line) => ({
    ...line,
    productId: toObjectId(line.productId),
    categoryId: toObjectId(line.categoryId),
  }));

  const { insertedId } = await sales().insertOne({
    productId: firstProductId,
    productName: saleProductSummary(priced.stockLines),
    quantity: priced.quantity,
    unitPriceCents: null,
    totalCents: priced.totalCents,
    wholesale: priced.wholesale,
    discountPercent: 0,
    lines: linesForDb,
    packs: packsForDb,
    retailLines: retailForDb,
    clientName,
    clientPhone,
    distributorId: distributorObjectId,
    soldBy: saleMeta?.soldBy ?? null,
    soldByName: saleMeta?.soldByName ?? null,
    status: SALE_STATUS.recorded,
    createdAt: now,
  });

  const saleId = String(insertedId);
  for (const prior of decremented) {
    await insertMovement({
      productId: prior._id,
      productName: prior.line.productName,
      type: MOVEMENT_TYPE.sale,
      quantityDelta: -prior.quantity,
      stockAfter: prior.stockAfter,
      reason: "Sale",
      refType: "sale",
      refId: saleId,
      createdBy: saleMeta?.soldBy ?? null,
      createdByName: saleMeta?.soldByName ?? null,
      createdAt: now,
    });
    const previousStock = prior.stockAfter + prior.quantity;
    await syncMonthAfterStockChange({
      product: { _id: prior._id, name: prior.line.productName },
      previousStock,
      nextStock: prior.stockAfter,
      type: MOVEMENT_TYPE.sale,
      quantityDelta: -prior.quantity,
      at: now,
    });
  }

  return {
    ok: true,
    saleId,
    totalCents: priced.totalCents,
    quantity: priced.quantity,
    wholesale: priced.wholesale,
  };
}

/** Recorded (incl. legacy missing status) or already requested — not voided. */
const VOIDABLE_STATUS_FILTER = {
  $or: [
    { status: SALE_STATUS.recorded },
    { status: SALE_STATUS.voidRequested },
    { status: { $exists: false } },
    { status: null },
  ],
};

const RECORDED_STATUS_FILTER = {
  $or: [{ status: SALE_STATUS.recorded }, { status: { $exists: false } }, { status: null }],
};

/**
 * Attendant requests a void. Same-day sales only, one open request per sale.
 */
export async function requestSaleVoid({ saleId, userId, userName, reason, now = new Date() }) {
  const _id = toObjectId(saleId);
  if (!_id) return { ok: false, reason: "Sale not found." };

  const trimmed = String(reason ?? "").trim();
  if (!trimmed) return { ok: false, reason: "A reason is required to request a void." };

  const sale = await sales().findOne({ _id, soldBy: userId });
  if (!sale) return { ok: false, reason: "Sale not found." };

  const status = effectiveSaleStatus(sale);
  if (status === SALE_STATUS.voided) {
    return { ok: false, reason: "That sale is already voided." };
  }
  if (status === SALE_STATUS.voidRequested) {
    return { ok: false, reason: "A void request is already open for this sale." };
  }
  if (!isSameLocalDay(sale.createdAt, now)) {
    return { ok: false, reason: "You can only request voids for sales recorded today." };
  }

  const res = await sales().updateOne(
    { _id, soldBy: userId, ...RECORDED_STATUS_FILTER },
    {
      $set: {
        status: SALE_STATUS.voidRequested,
        voidRequestReason: trimmed,
        voidRequestedAt: now,
        voidRequestedBy: userId,
        voidRequestedByName: userName,
        updatedAt: now,
      },
    },
  );

  // Race: another request may have landed; re-check.
  if (res.matchedCount !== 1) {
    const again = await sales().findOne({ _id });
    if (effectiveSaleStatus(again) === SALE_STATUS.voidRequested) {
      return { ok: false, reason: "A void request is already open for this sale." };
    }
    return { ok: false, reason: "Could not request a void for that sale." };
  }

  return { ok: true };
}

/**
 * Admin executes a void (any age). Restores stock, marks sale voided, writes
 * a void movement. Works for open requests and direct voids of recorded sales.
 */
export async function executeSaleVoid({ saleId, adminId, adminName, reason, now = new Date() }) {
  const _id = toObjectId(saleId);
  if (!_id) return { ok: false, reason: "Sale not found." };

  const sale = await sales().findOne({ _id });
  if (!sale) return { ok: false, reason: "Sale not found." };

  const status = effectiveSaleStatus(sale);
  if (status === SALE_STATUS.voided) {
    return { ok: false, reason: "That sale is already voided." };
  }

  const trimmed = String(reason ?? "").trim();
  const voidReason =
    trimmed ||
    (status === SALE_STATUS.voidRequested ? String(sale.voidRequestReason ?? "").trim() : "");
  if (!voidReason) {
    return { ok: false, reason: "A reason is required to void this sale." };
  }

  const claimed = await sales().findOneAndUpdate(
    { _id, ...VOIDABLE_STATUS_FILTER },
    {
      $set: {
        status: SALE_STATUS.voided,
        voidReason,
        voidedAt: now,
        voidedBy: adminId,
        voidedByName: adminName,
        updatedAt: now,
      },
    },
    { returnDocument: "before" },
  );

  if (!claimed) {
    const again = await sales().findOne({ _id });
    if (effectiveSaleStatus(again) === SALE_STATUS.voided) {
      return { ok: false, reason: "That sale is already voided." };
    }
    return { ok: false, reason: "Could not void that sale." };
  }

  const lines = saleStockLines({
    ...claimed,
    productId: claimed.productId ? String(claimed.productId) : null,
    lines: Array.isArray(claimed.lines)
      ? claimed.lines.map((line) => ({
          ...line,
          productId: line.productId ? String(line.productId) : null,
        }))
      : undefined,
  });

  let stockAfter = null;
  for (const line of lines) {
    const productId = toObjectId(line.productId);
    const qty = line.quantity ?? 0;
    if (!productId || qty <= 0) continue;

    const updated = await products().findOneAndUpdate(
      { _id: productId },
      { $inc: { stock: qty }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    stockAfter = updated?.stock ?? stockAfter;

    await insertMovement({
      productId,
      productName: line.productName,
      type: MOVEMENT_TYPE.void,
      quantityDelta: qty,
      stockAfter: updated?.stock ?? null,
      reason: voidReason,
      refType: "sale",
      refId: String(_id),
      createdBy: adminId,
      createdByName: adminName,
      createdAt: now,
    });

    if (updated) {
      const previousStock = updated.stock - qty;
      await syncMonthAfterStockChange({
        product: updated,
        previousStock,
        nextStock: updated.stock,
        type: MOVEMENT_TYPE.void,
        quantityDelta: qty,
        at: now,
      });
    }
  }

  return { ok: true, stockAfter };
}

/**
 * Today (local) integrity snapshot: movements, sales in scope, product rollup,
 * and discrepancy list so nothing is left unaccounted for.
 */
export async function getTodayIntegrity(now = new Date()) {
  const start = startOfLocalDay(now);
  const end = endOfLocalDay(now);

  const movementRows = await movements()
    .find({ createdAt: { $gte: start, $lt: end } })
    .sort({ createdAt: -1 })
    .toArray();
  const movementList = movementRows.map(serializeMovement);

  const refIds = [
    ...new Set(
      movementList
        .filter((m) => m.refType === "sale" && m.refId)
        .map((m) => m.refId)
        .filter((id) => ObjectId.isValid(id)),
    ),
  ].map((id) => new ObjectId(id));

  const saleFilter = {
    $or: [
      { createdAt: { $gte: start, $lt: end } },
      { voidedAt: { $gte: start, $lt: end } },
      ...(refIds.length ? [{ _id: { $in: refIds } }] : []),
    ],
  };

  const saleRows = await sales().find(saleFilter).sort({ createdAt: -1 }).toArray();
  const saleList = saleRows.map(serializeSale);

  const pendingVoids = saleList.filter((s) => s.status === SALE_STATUS.voidRequested);
  // Pending voids from earlier today that somehow aren't in saleList are already included
  // via createdAt. Also pull any pending voids outside today for the queue.
  const extraPending = await sales()
    .find({
      status: SALE_STATUS.voidRequested,
      _id: { $nin: saleRows.map((s) => s._id) },
    })
    .sort({ voidRequestedAt: -1 })
    .toArray();
  const pendingQueue = [...pendingVoids, ...extraPending.map(serializeSale)];

  const { products: productRows, discrepancies } = findDiscrepancies(saleList, movementList, {
    start,
    end,
  });

  const activeToday = saleList.filter(
    (s) =>
      s.createdAt &&
      new Date(s.createdAt) >= start &&
      new Date(s.createdAt) < end &&
      s.status !== SALE_STATUS.voided,
  );
  const voidedToday = saleList.filter(
    (s) => s.status === SALE_STATUS.voided && s.voidedAt && inIsoWindow(s.voidedAt, start, end),
  );

  return {
    period: {
      label: "Today",
      start: start.toISOString(),
      end: end.toISOString(),
    },
    summary: {
      salesCount: activeToday.length,
      salesUnits: activeToday.reduce((sum, s) => sum + (s.quantity ?? 0), 0),
      salesRevenueCents: activeToday.reduce((sum, s) => sum + (s.totalCents ?? 0), 0),
      voidedCount: voidedToday.length,
      voidedUnits: voidedToday.reduce((sum, s) => sum + (s.quantity ?? 0), 0),
      movementsCount: movementList.length,
      adjustCount: movementList.filter((m) => m.type === MOVEMENT_TYPE.adminAdjust).length,
      adjustNetUnits: movementList
        .filter((m) => m.type === MOVEMENT_TYPE.adminAdjust)
        .reduce((sum, m) => sum + (m.quantityDelta ?? 0), 0),
      receiveCount: movementList.filter((m) => m.type === MOVEMENT_TYPE.receive).length,
      receiveUnits: movementList
        .filter((m) => m.type === MOVEMENT_TYPE.receive)
        .reduce((sum, m) => sum + (m.quantityDelta ?? 0), 0),
      pendingVoidRequests: pendingQueue.length,
      discrepancyCount: discrepancies.length,
    },
    discrepancies,
    products: productRows,
    movements: movementList,
    sales: saleList,
    pendingVoids: pendingQueue,
  };
}

function inIsoWindow(iso, start, end) {
  const t = new Date(iso).getTime();
  return t >= start.getTime() && t < end.getTime();
}

export { SALE_STATUS, MOVEMENT_TYPE, isSameLocalDay, effectiveSaleStatus };
