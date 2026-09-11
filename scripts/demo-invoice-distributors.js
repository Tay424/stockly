/**
 * Smoke: wholesale sale upserts distributor + links sale; 24h filter works.
 * Avoids server-only imports (same pattern as demo-receipt-packs.js).
 *
 * Run: node --env-file=.env scripts/demo-invoice-distributors.js
 */
import assert from "node:assert/strict";
import { MongoClient, ObjectId } from "mongodb";

import { priceReceipt, saleProductSummary } from "../lib/pricing.js";

function normalizePhone(phone) {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
const db = client.db();

async function main() {
  assert.equal(normalizePhone("+263 77 123 4567"), "+263771234567");

  await client.connect();
  const categories = db.collection("category");
  const products = db.collection("product");
  const sales = db.collection("sale");
  const distributors = db.collection("distributor");
  const movements = db.collection("stock_movement");

  const stamp = Date.now();
  const now = new Date();
  const phone = normalizePhone(`+26377${String(stamp).slice(-7)}`);

  const { insertedId: catId } = await categories.insertOne({
    name: `InvoiceDemo-${stamp}`,
    description: "Invoice/distributor smoke",
    wholesalePackQty: 10,
    wholesalePackPriceCents: 5000,
    createdAt: now,
    updatedAt: now,
  });

  const { insertedId: productId } = await products.insertOne({
    name: `PackSKU-${stamp}`,
    categoryId: catId,
    stock: 25,
    retailPriceCents: 800,
    wholesalePriceCents: 0,
    wholesaleMinQty: 0,
    createdAt: now,
    updatedAt: now,
  });

  const product = {
    id: String(productId),
    name: `PackSKU-${stamp}`,
    categoryId: String(catId),
    categoryName: `InvoiceDemo-${stamp}`,
    stock: 25,
    retailPriceCents: 800,
    wholesalePackQty: 10,
    wholesalePackPriceCents: 5000,
  };

  const cartLines = [{ productId: product.id, quantity: 10 }];
  const productsById = new Map([[product.id, product]]);
  const categoriesById = new Map([
    [
      product.categoryId,
      {
        id: product.categoryId,
        name: product.categoryName,
        wholesalePackQty: 10,
        wholesalePackPriceCents: 5000,
      },
    ],
  ]);

  const priced = priceReceipt(cartLines, productsById, categoriesById);
  assert.equal(priced.ok, true);
  assert.equal(priced.wholesale, true);
  assert.equal(priced.totalCents, 5000);

  const { insertedId: distributorId } = await distributors.insertOne({
    name: `Distro-${stamp}`,
    phone,
    lastSaleAt: now,
    createdAt: now,
    updatedAt: now,
  });

  const sellerId = new ObjectId();
  const { insertedId: saleId } = await sales.insertOne({
    productId,
    productName: saleProductSummary(priced.stockLines),
    quantity: priced.quantity,
    unitPriceCents: null,
    totalCents: priced.totalCents,
    wholesale: true,
    discountPercent: 0,
    lines: priced.stockLines.map((line) => ({
      ...line,
      productId,
      categoryId: catId,
    })),
    packs: priced.packs.map((pack) => ({
      ...pack,
      categoryId: catId,
      contributions: pack.contributions.map((c) => ({
        ...c,
        productId,
      })),
    })),
    retailLines: [],
    clientName: `Distro-${stamp}`,
    clientPhone: phone,
    distributorId,
    soldBy: sellerId,
    soldByName: "Smoke Seller",
    status: "recorded",
    createdAt: now,
  });

  await products.updateOne({ _id: productId }, { $inc: { stock: -10 }, $set: { updatedAt: now } });
  await movements.insertOne({
    productId,
    productName: product.name,
    type: "sale",
    quantityDelta: -10,
    stockAfter: 15,
    reason: "Sale",
    refType: "sale",
    refId: String(saleId),
    createdBy: sellerId,
    createdByName: "Smoke Seller",
    createdAt: now,
  });

  const recent = await sales
    .find({
      soldBy: sellerId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
    .toArray();
  assert.ok(recent.some((s) => String(s._id) === String(saleId)), "24h filter missed sale");

  const oldSale = await sales.insertOne({
    productId,
    productName: "Old sale",
    quantity: 1,
    totalCents: 800,
    wholesale: false,
    soldBy: sellerId,
    soldByName: "Smoke Seller",
    status: "recorded",
    createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
  });
  const only24h = await sales
    .find({
      soldBy: sellerId,
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    })
    .toArray();
  assert.equal(
    only24h.some((s) => String(s._id) === String(oldSale.insertedId)),
    false,
    "48h-old sale should be excluded from 24h window",
  );

  const perf = await distributors
    .aggregate([
      { $match: { _id: distributorId } },
      {
        $lookup: {
          from: "sale",
          let: { distributorId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$distributorId", "$$distributorId"] },
                status: { $ne: "voided" },
              },
            },
            {
              $group: {
                _id: null,
                saleCount: { $sum: 1 },
                revenueCents: { $sum: "$totalCents" },
              },
            },
          ],
          as: "stats",
        },
      },
    ])
    .toArray();
  assert.equal(perf[0]?.stats?.[0]?.saleCount, 1);
  assert.equal(perf[0]?.stats?.[0]?.revenueCents, 5000);

  console.log(
    JSON.stringify(
      {
        ok: true,
        saleId: String(saleId),
        distributorId: String(distributorId),
        phone,
        totalCents: priced.totalCents,
        invoicePath: `/dashboard/sales/${saleId}/invoice`,
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch(async (err) => {
  console.error(err);
  try {
    await client.close();
  } catch {
    /* ignore */
  }
  process.exit(1);
});
