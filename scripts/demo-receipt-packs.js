/**
 * Demo receipt packs against MongoDB without importing server-only modules.
 * Run: node --env-file=.env scripts/demo-receipt-packs.js
 */
import assert from "node:assert/strict";
import { MongoClient, ObjectId } from "mongodb";

import { priceReceipt, saleProductSummary } from "../lib/pricing.js";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
const db = client.db();

async function main() {
  await client.connect();
  const categories = db.collection("category");
  const products = db.collection("product");
  const sales = db.collection("sale");
  const movements = db.collection("stock_movement");

  const stamp = Date.now();
  const now = new Date();

  const { insertedId: saltsId } = await categories.insertOne({
    name: `Salts-${stamp}`,
    description: "Pack demo",
    wholesalePackQty: 20,
    wholesalePackPriceCents: 8000,
    createdAt: now,
    updatedAt: now,
  });
  const { insertedId: packId } = await categories.insertOne({
    name: `Packaging-${stamp}`,
    description: "No pack",
    wholesalePackQty: 0,
    wholesalePackPriceCents: 0,
    createdAt: now,
    updatedAt: now,
  });

  const { insertedId: pinkId } = await products.insertOne({
    name: `Pink-${stamp}`,
    description: "",
    categoryId: saltsId,
    retailPriceCents: 500,
    wholesalePriceCents: 400,
    wholesaleMinQty: 0,
    stock: 100,
    discountPercent: 0,
    discountStartsAt: null,
    discountEndsAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const { insertedId: greenId } = await products.insertOne({
    name: `Green-${stamp}`,
    description: "",
    categoryId: saltsId,
    retailPriceCents: 600,
    wholesalePriceCents: 400,
    wholesaleMinQty: 0,
    stock: 100,
    discountPercent: 0,
    discountStartsAt: null,
    discountEndsAt: null,
    createdAt: now,
    updatedAt: now,
  });
  const { insertedId: bagId } = await products.insertOne({
    name: `Bag-${stamp}`,
    description: "",
    categoryId: packId,
    retailPriceCents: 100,
    wholesalePriceCents: 80,
    wholesaleMinQty: 0,
    stock: 50,
    discountPercent: 0,
    discountStartsAt: null,
    discountEndsAt: null,
    createdAt: now,
    updatedAt: now,
  });

  const productsById = {
    [String(pinkId)]: {
      id: String(pinkId),
      name: `Pink-${stamp}`,
      categoryId: String(saltsId),
      retailPriceCents: 500,
    },
    [String(greenId)]: {
      id: String(greenId),
      name: `Green-${stamp}`,
      categoryId: String(saltsId),
      retailPriceCents: 600,
    },
    [String(bagId)]: {
      id: String(bagId),
      name: `Bag-${stamp}`,
      categoryId: String(packId),
      retailPriceCents: 100,
    },
  };
  const categoriesById = {
    [String(saltsId)]: {
      name: `Salts-${stamp}`,
      wholesalePackQty: 20,
      wholesalePackPriceCents: 8000,
    },
    [String(packId)]: {
      name: `Packaging-${stamp}`,
      wholesalePackQty: 0,
      wholesalePackPriceCents: 0,
    },
  };

  // 12 pink + 9 green = 21 salts → $80 + 1 green retail ($6) + 2 bags ($2) = $88
  const cart = [
    { productId: String(pinkId), quantity: 12 },
    { productId: String(greenId), quantity: 9 },
    { productId: String(bagId), quantity: 2 },
  ];
  const priced = priceReceipt(cart, productsById, categoriesById);
  assert.equal(priced.ok, true);
  assert.equal(priced.totalCents, 8800);
  assert.equal(priced.packs.length, 1);
  assert.equal(priced.retailLines.length, 2); // 1 green leftover + bag

  // Mimic recordSaleReceipt stock + sale + movements
  for (const line of priced.stockLines) {
    const res = await products.findOneAndUpdate(
      { _id: new ObjectId(line.productId), stock: { $gte: line.quantity } },
      { $inc: { stock: -line.quantity }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    assert.ok(res, `stock fail ${line.productName}`);
    line.stockAfter = res.stock;
  }

  const { insertedId: saleId } = await sales.insertOne({
    productId: pinkId,
    productName: saleProductSummary(priced.stockLines),
    quantity: priced.quantity,
    unitPriceCents: null,
    totalCents: priced.totalCents,
    wholesale: priced.wholesale,
    discountPercent: 0,
    lines: priced.stockLines.map((l) => ({
      ...l,
      productId: new ObjectId(l.productId),
      categoryId: new ObjectId(l.categoryId),
    })),
    packs: priced.packs.map((p) => ({
      ...p,
      categoryId: new ObjectId(p.categoryId),
      contributions: p.contributions.map((c) => ({
        ...c,
        productId: new ObjectId(c.productId),
      })),
    })),
    retailLines: priced.retailLines.map((l) => ({
      ...l,
      productId: new ObjectId(l.productId),
      categoryId: new ObjectId(l.categoryId),
    })),
    soldBy: "demo-seller",
    soldByName: "Demo Seller",
    status: "recorded",
    createdAt: now,
  });

  for (const line of priced.stockLines) {
    await movements.insertOne({
      productId: new ObjectId(line.productId),
      productName: line.productName,
      type: "sale",
      quantityDelta: -line.quantity,
      stockAfter: line.stockAfter,
      reason: "Sale",
      refType: "sale",
      refId: String(saleId),
      createdBy: "demo-seller",
      createdByName: "Demo Seller",
      createdAt: now,
    });
  }

  const moveCount = await movements.countDocuments({ refId: String(saleId), type: "sale" });
  assert.equal(moveCount, 3);

  const pinkAfter = await products.findOne({ _id: pinkId });
  const greenAfter = await products.findOne({ _id: greenId });
  assert.equal(pinkAfter.stock, 88);
  assert.equal(greenAfter.stock, 91);

  // Void whole receipt — restore each line
  const sale = await sales.findOne({ _id: saleId });
  await sales.updateOne({ _id: saleId }, { $set: { status: "voided", voidedAt: now } });
  for (const line of sale.lines) {
    const updated = await products.findOneAndUpdate(
      { _id: line.productId },
      { $inc: { stock: line.quantity }, $set: { updatedAt: now } },
      { returnDocument: "after" },
    );
    await movements.insertOne({
      productId: line.productId,
      productName: line.productName,
      type: "void",
      quantityDelta: line.quantity,
      stockAfter: updated.stock,
      reason: "Demo void",
      refType: "sale",
      refId: String(saleId),
      createdBy: "demo-admin",
      createdByName: "Demo Admin",
      createdAt: now,
    });
  }

  const pinkRestored = await products.findOne({ _id: pinkId });
  assert.equal(pinkRestored.stock, 100);

  console.log("PASS demo-receipt-packs", {
    saleId: String(saleId),
    totalCents: priced.totalCents,
    packs: priced.packs[0].packCount,
    productName: saleProductSummary(priced.stockLines),
  });
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
