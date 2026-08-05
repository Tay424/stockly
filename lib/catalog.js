import "server-only";

import { ObjectId } from "mongodb";

import { db } from "./db.js";
import {
  MOVEMENT_TYPE,
  SALE_STATUS,
  effectiveSaleStatus,
  endOfLocalDay,
  findDiscrepancies,
  isSameLocalDay,
  startOfLocalDay,
} from "./stock-ledger.js";

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
  return rows.map(serialize);
}

export async function createCategory({ name, description }) {
  const now = new Date();
  await categories().insertOne({ name, description, createdAt: now, updatedAt: now });
}

export async function updateCategory(id, { name, description }) {
  const _id = toObjectId(id);
  if (!_id) return false;
  const res = await categories().updateOne(
    { _id },
    { $set: { name, description, updatedAt: new Date() } },
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
 * never changes silently.
 */
export async function createProduct(fields, { actor, stockReason } = {}) {
  const now = new Date();
  const stock = fields.stock ?? 0;
  const { insertedId } = await products().insertOne({
    ...fields,
    categoryId: toObjectId(fields.categoryId),
    createdAt: now,
    updatedAt: now,
  });

  if (stock > 0) {
    const reason = String(stockReason ?? "").trim() || "Initial stock";
    await insertMovement({
      productId: insertedId,
      productName: fields.name,
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
  }

  return String(insertedId);
}

/**
 * Updates product fields. When stock changes, `stockReason` is required and a
 * ledger row is written. Non-stock edits do not touch the ledger.
 */
export async function updateProduct(id, fields, { actor, stockReason } = {}) {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, reason: "Product not found." };

  const existing = await products().findOne({ _id });
  if (!existing) return { ok: false, reason: "Product not found." };

  const nextStock = fields.stock;
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
        ...fields,
        categoryId: toObjectId(fields.categoryId),
        updatedAt: new Date(),
      },
    },
  );
  if (res.matchedCount !== 1) return { ok: false, reason: "Product not found." };

  if (stockChanged) {
    const delta = nextStock - existing.stock;
    await insertMovement({
      productId: _id,
      productName: fields.name ?? existing.name,
      type: MOVEMENT_TYPE.adminAdjust,
      quantityDelta: delta,
      stockAfter: nextStock,
      reason: String(stockReason).trim(),
      refType: "product",
      refId: String(_id),
      createdBy: actor?.id ?? null,
      createdByName: actor?.name ?? "Admin",
      createdAt: new Date(),
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

const serializeSale = ({ _id, productId, soldBy, ...rest }) => ({
  id: String(_id),
  productId: productId ? String(productId) : null,
  soldBy: soldBy ? String(soldBy) : null,
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

export async function listSalesBySeller(userId, limit = 20) {
  const rows = await sales()
    .find({ soldBy: userId })
    .sort({ createdAt: -1 })
    .limit(limit)
    .toArray();
  return rows.map(serializeSale);
}

export async function listPendingVoidRequests() {
  const rows = await sales()
    .find({ status: SALE_STATUS.voidRequested })
    .sort({ voidRequestedAt: -1 })
    .toArray();
  return rows.map(serializeSale);
}

/** Products a seller can pick from — in stock, cheapest lookup, newest first. */
export async function listSellableProducts() {
  const rows = await products().find({ stock: { $gt: 0 } }).sort({ name: 1 }).toArray();
  return rows.map(({ _id, categoryId, ...rest }) => ({
    id: String(_id),
    categoryId: categoryId ? String(categoryId) : null,
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

  return { ok: true, stockLeft: updated.stock, saleId: String(insertedId) };
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

  const productId = claimed.productId;
  const qty = claimed.quantity ?? 0;
  let stockAfter = null;

  if (productId && qty > 0) {
    const updated = await products().findOneAndUpdate(
      { _id: productId },
      { $inc: { stock: qty }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    stockAfter = updated?.stock ?? null;

    await insertMovement({
      productId,
      productName: claimed.productName,
      type: MOVEMENT_TYPE.void,
      quantityDelta: qty,
      stockAfter,
      reason: voidReason,
      refType: "sale",
      refId: String(_id),
      createdBy: adminId,
      createdByName: adminName,
      createdAt: now,
    });
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
