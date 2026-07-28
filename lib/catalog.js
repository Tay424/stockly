import "server-only";

import { ObjectId } from "mongodb";

import { db } from "./db.js";

const categories = () => db.collection("category");
const products = () => db.collection("product");
const sales = () => db.collection("sale");

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

export async function createProduct(fields) {
  const now = new Date();
  await products().insertOne({
    ...fields,
    categoryId: toObjectId(fields.categoryId),
    createdAt: now,
    updatedAt: now,
  });
}

export async function updateProduct(id, fields) {
  const _id = toObjectId(id);
  if (!_id) return false;
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
  return res.matchedCount === 1;
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

/**
 * Decrements stock and writes the sale in one step. The `stock: { $gte: qty }`
 * filter is what makes it safe: two sellers hitting the last unit at the same
 * time means one update matches and the other returns null, so we can never
 * oversell. Prices are snapshotted onto the sale so the ledger stays truthful
 * after a price change.
 */
export async function recordSale({ productId, quantity, sale }) {
  const _id = toObjectId(productId);
  if (!_id) return { ok: false, reason: "Product not found." };

  const updated = await products().findOneAndUpdate(
    { _id, stock: { $gte: quantity } },
    { $inc: { stock: -quantity }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );

  if (!updated) {
    const exists = await products().countDocuments({ _id }, { limit: 1 });
    return {
      ok: false,
      reason: exists ? "Not enough stock left for that quantity." : "Product not found.",
    };
  }

  await sales().insertOne({ ...sale, productId: _id, createdAt: new Date() });
  return { ok: true, stockLeft: updated.stock };
}
