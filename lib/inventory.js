import "server-only";

import { ObjectId } from "mongodb";

import { db } from "./db.js";
import { notifyLowStock } from "./notify.js";
import { DEFAULT_LOW_STOCK_THRESHOLD, MOVEMENT_TYPE } from "./stock-ledger.js";

const products = () => db.collection("product");
const movements = () => db.collection("stock_movement");
const stockMonths = () => db.collection("stock_month");

/** UTC YYYY-MM — matches finance.currentMonthKey without importing finance (cycle). */
export function inventoryMonthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export function toObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

export function thresholdFor(product) {
  const n = product?.lowStockThreshold;
  if (typeof n === "number" && Number.isInteger(n) && n >= 0) return n;
  return DEFAULT_LOW_STOCK_THRESHOLD;
}

export function stockHealthStatus(stock, threshold) {
  const qty = Number(stock) || 0;
  if (qty <= 0) return "out";
  if (qty <= threshold) return "low";
  return "ok";
}

/**
 * First touch of a month snapshots current on-hand as opening (carry-over).
 * Call BEFORE mutating stock so opening is not polluted by the change.
 */
export async function ensureMonthOpeningForProduct(product, monthKey = inventoryMonthKey()) {
  if (!product?._id && !product?.id) return null;
  const productId = product._id ?? toObjectId(product.id);
  if (!productId) return null;

  const existing = await stockMonths().findOne({ productId, monthKey });
  if (existing) return existing;

  const openingStock = Number(product.stock) || 0;
  const doc = {
    productId,
    productName: product.name ?? "—",
    monthKey,
    openingStock,
    received: 0,
    sold: 0,
    voided: 0,
    adjusted: 0,
    closingStock: openingStock,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  try {
    await stockMonths().insertOne(doc);
    return doc;
  } catch (err) {
    if (err?.code === 11000) {
      return stockMonths().findOne({ productId, monthKey });
    }
    throw err;
  }
}

/** Snapshot opening stock for every product missing a row this month. */
export async function ensureMonthOpening(monthKey = inventoryMonthKey()) {
  const rows = await products().find({}).project({ name: 1, stock: 1 }).toArray();
  for (const product of rows) {
    await ensureMonthOpeningForProduct(product, monthKey);
  }
  try {
    await stockMonths().createIndex({ productId: 1, monthKey: 1 }, { unique: true });
  } catch {
    // Index may already exist.
  }
  return { monthKey, productCount: rows.length };
}

async function bumpMonthRollup(productId, monthKey, patch) {
  await stockMonths().updateOne(
    { productId, monthKey },
    { $inc: patch.$inc ?? {}, $set: { ...(patch.$set ?? {}), updatedAt: new Date() } },
  );
}

/**
 * Notify only when crossing from healthy into low/out — not on every sale while already low.
 */
export async function maybeNotifyLowStock(product, previousStock, nextStock) {
  const threshold = thresholdFor(product);
  const wasOk = stockHealthStatus(previousStock, threshold) === "ok";
  const nextStatus = stockHealthStatus(nextStock, threshold);
  if (!wasOk || nextStatus === "ok") {
    if (nextStatus === "ok" && product.lowStockNotifiedAt) {
      await products().updateOne(
        { _id: product._id },
        { $unset: { lowStockNotifiedAt: "" }, $set: { updatedAt: new Date() } },
      );
    }
    return { notified: false };
  }

  const result = await notifyLowStock({
    product: {
      id: String(product._id),
      name: product.name,
      stock: nextStock,
      lowStockThreshold: threshold,
    },
    stock: nextStock,
    threshold,
  });

  await products().updateOne(
    { _id: product._id },
    { $set: { lowStockNotifiedAt: new Date(), updatedAt: new Date() } },
  );
  return { notified: true, ...result };
}

/**
 * Replenish stock from Inventory. Writes a dated `receive` ledger row and
 * updates the month rollup. Opening snapshot is ensured before the increase.
 */
export async function receiveStock({
  productId,
  quantity,
  reason,
  actor,
  receivedAt = new Date(),
}) {
  const _id = toObjectId(productId);
  const qty = Number(quantity);
  if (!_id) return { ok: false, reason: "Product not found." };
  if (!Number.isInteger(qty) || qty < 1) {
    return { ok: false, reason: "Quantity must be a whole number of at least 1." };
  }
  const note = String(reason ?? "").trim();
  if (!note) return { ok: false, reason: "A reason is required when receiving stock." };

  const when = receivedAt instanceof Date ? receivedAt : new Date(receivedAt);
  if (Number.isNaN(when.getTime())) {
    return { ok: false, reason: "Receive date must be valid." };
  }

  const product = await products().findOne({ _id });
  if (!product) return { ok: false, reason: "Product not found." };

  const monthKey = inventoryMonthKey(when);
  await ensureMonthOpeningForProduct(product, monthKey);

  const previousStock = Number(product.stock) || 0;
  const nextStock = previousStock + qty;

  await products().updateOne({ _id }, { $set: { stock: nextStock, updatedAt: new Date() } });

  await movements().insertOne({
    productId: _id,
    productName: product.name,
    type: MOVEMENT_TYPE.receive,
    quantityDelta: qty,
    stockAfter: nextStock,
    reason: note,
    refType: "product",
    refId: String(_id),
    createdBy: actor?.id ?? null,
    createdByName: actor?.name ?? "Admin",
    createdAt: when,
  });

  await bumpMonthRollup(_id, monthKey, {
    $inc: { received: qty },
    $set: { closingStock: nextStock, productName: product.name },
  });

  await maybeNotifyLowStock({ ...product, stock: previousStock }, previousStock, nextStock);

  return { ok: true, stock: nextStock };
}

export async function listInventoryHealth() {
  const rows = await products()
    .aggregate([
      { $sort: { name: 1 } },
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

  const items = rows.map(({ _id, categoryId, category, ...rest }) => {
    const threshold = thresholdFor(rest);
    const stock = Number(rest.stock) || 0;
    const status = stockHealthStatus(stock, threshold);
    return {
      id: String(_id),
      categoryId: categoryId ? String(categoryId) : null,
      categoryName: category?.name ?? null,
      name: rest.name,
      stock,
      lowStockThreshold: threshold,
      status,
    };
  });

  const counts = {
    total: items.length,
    ok: items.filter((i) => i.status === "ok").length,
    low: items.filter((i) => i.status === "low").length,
    out: items.filter((i) => i.status === "out").length,
  };
  counts.needsAttention = counts.low + counts.out;

  return { items, counts };
}

/** Badge count for admin nav — products that are low or out. */
export async function countLowStockProducts() {
  const { counts } = await listInventoryHealth();
  return counts.needsAttention;
}

export async function getMonthInventorySummary(monthKey = inventoryMonthKey()) {
  await ensureMonthOpening(monthKey);
  const rows = await stockMonths().find({ monthKey }).toArray();
  const openingStock = rows.reduce((sum, r) => sum + (r.openingStock ?? 0), 0);
  const received = rows.reduce((sum, r) => sum + (r.received ?? 0), 0);
  const sold = rows.reduce((sum, r) => sum + (r.sold ?? 0), 0);
  const voided = rows.reduce((sum, r) => sum + (r.voided ?? 0), 0);
  const adjusted = rows.reduce((sum, r) => sum + (r.adjusted ?? 0), 0);
  const closingStock = rows.reduce((sum, r) => sum + (r.closingStock ?? 0), 0);
  return {
    monthKey,
    productCount: rows.length,
    openingStock,
    received,
    sold,
    voided,
    adjusted,
    closingStock,
    rows: rows.map(({ _id, productId, ...rest }) => ({
      id: String(_id),
      productId: String(productId),
      ...rest,
    })),
  };
}

export async function listStockReceives({ monthKey = null, limit = 100 } = {}) {
  const filter = { type: MOVEMENT_TYPE.receive };
  if (monthKey) {
    const [y, m] = monthKey.split("-").map(Number);
    const start = new Date(Date.UTC(y, m - 1, 1));
    const end = new Date(Date.UTC(y, m, 1));
    filter.createdAt = { $gte: start, $lt: end };
  }
  const rows = await movements().find(filter).sort({ createdAt: -1 }).limit(limit).toArray();
  return rows.map(({ _id, productId, ...rest }) => ({
    id: String(_id),
    productId: productId ? String(productId) : null,
    ...rest,
    createdAt: rest.createdAt?.toISOString?.() ?? rest.createdAt ?? null,
  }));
}

/**
 * Keep month rollups in sync after sale / void / admin adjust.
 * Ensures opening using pre-change stock, then applies rollup + notify.
 */
export async function syncMonthAfterStockChange({
  product,
  previousStock,
  nextStock,
  type,
  quantityDelta,
  at = new Date(),
}) {
  const monthKey = inventoryMonthKey(at);
  await ensureMonthOpeningForProduct({ ...product, stock: previousStock }, monthKey);
  const inc = {};
  if (type === MOVEMENT_TYPE.sale) inc.sold = Math.abs(quantityDelta);
  else if (type === MOVEMENT_TYPE.void) inc.voided = Math.abs(quantityDelta);
  else if (type === MOVEMENT_TYPE.adminAdjust) inc.adjusted = quantityDelta;
  else if (type === MOVEMENT_TYPE.receive) inc.received = Math.abs(quantityDelta);

  await bumpMonthRollup(product._id, monthKey, {
    $inc: inc,
    $set: { closingStock: nextStock, productName: product.name },
  });
  await maybeNotifyLowStock({ ...product, stock: previousStock }, previousStock, nextStock);
}
