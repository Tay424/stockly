/**
 * Demo Phase 1b ledger/void flow against MongoDB without importing server-only modules.
 * Run: node --env-file=.env scripts/demo-phase-1b.js
 */
import assert from "node:assert/strict";
import { MongoClient } from "mongodb";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const client = new MongoClient(uri);
const db = client.db();

const SALE_STATUS = {
  recorded: "recorded",
  voidRequested: "void_requested",
  voided: "voided",
};
const MOVEMENT_TYPE = { sale: "sale", void: "void", adminAdjust: "admin_adjust" };

function startOfLocalDay(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function main() {
  await client.connect();
  const products = db.collection("product");
  const sales = db.collection("sale");
  const movements = db.collection("stock_movement");
  const categories = db.collection("category");

  const stamp = Date.now();
  const admin = { id: "demo-admin", name: "Demo Admin" };
  const attendant = { id: "demo-attendant", name: "Demo Attendant" };

  let category = await categories.findOne({});
  if (!category) {
    const { insertedId } = await categories.insertOne({
      name: `Demo Cat ${stamp}`,
      description: "phase 1b",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    category = { _id: insertedId };
  }

  const now = new Date();
  const { insertedId: productId } = await products.insertOne({
    name: `Demo Soap ${stamp}`,
    description: "phase 1b demo",
    categoryId: category._id,
    retailPriceCents: 500,
    wholesalePriceCents: 400,
    wholesaleMinQty: 10,
    stock: 20,
    discountPercent: 0,
    discountStartsAt: null,
    discountEndsAt: null,
    createdAt: now,
    updatedAt: now,
  });

  await movements.insertOne({
    productId,
    productName: `Demo Soap ${stamp}`,
    type: MOVEMENT_TYPE.adminAdjust,
    quantityDelta: 20,
    stockAfter: 20,
    reason: "Opening stock for Phase 1b demo",
    refType: "product",
    refId: String(productId),
    createdBy: admin.id,
    createdByName: admin.name,
    createdAt: now,
  });
  console.log("1) Created product with admin_adjust opening stock");

  const updated = await products.findOneAndUpdate(
    { _id: productId, stock: { $gte: 3 } },
    { $inc: { stock: -3 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  assert.ok(updated);
  const { insertedId: saleId } = await sales.insertOne({
    productId,
    productName: `Demo Soap ${stamp}`,
    quantity: 3,
    unitPriceCents: 500,
    totalCents: 1500,
    wholesale: false,
    discountPercent: 0,
    soldBy: attendant.id,
    soldByName: attendant.name,
    status: SALE_STATUS.recorded,
    createdAt: new Date(),
  });
  await movements.insertOne({
    productId,
    productName: `Demo Soap ${stamp}`,
    type: MOVEMENT_TYPE.sale,
    quantityDelta: -3,
    stockAfter: updated.stock,
    reason: "Sale",
    refType: "sale",
    refId: String(saleId),
    createdBy: attendant.id,
    createdByName: attendant.name,
    createdAt: new Date(),
  });
  console.log("2) Recorded sale + sale movement; stock left", updated.stock);

  await sales.updateOne(
    { _id: saleId },
    {
      $set: {
        status: SALE_STATUS.voidRequested,
        voidRequestReason: "Wrong quantity entered",
        voidRequestedAt: new Date(),
        voidRequestedBy: attendant.id,
        voidRequestedByName: attendant.name,
      },
    },
  );
  console.log("3) Attendant requested void");

  const openCount = await sales.countDocuments({
    _id: saleId,
    status: SALE_STATUS.voidRequested,
  });
  assert.equal(openCount, 1);
  console.log("4) One open request per sale — OK");

  const claimed = await sales.findOneAndUpdate(
    { _id: saleId, status: SALE_STATUS.voidRequested },
    {
      $set: {
        status: SALE_STATUS.voided,
        voidReason: "Approved — wrong quantity",
        voidedAt: new Date(),
        voidedBy: admin.id,
        voidedByName: admin.name,
      },
    },
    { returnDocument: "before" },
  );
  assert.ok(claimed);
  const restored = await products.findOneAndUpdate(
    { _id: productId },
    { $inc: { stock: 3 }, $set: { updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  await movements.insertOne({
    productId,
    productName: `Demo Soap ${stamp}`,
    type: MOVEMENT_TYPE.void,
    quantityDelta: 3,
    stockAfter: restored.stock,
    reason: "Approved — wrong quantity",
    refType: "sale",
    refId: String(saleId),
    createdBy: admin.id,
    createdByName: admin.name,
    createdAt: new Date(),
  });
  console.log("5) Admin executed void; stock restored to", restored.stock);
  assert.equal(restored.stock, 20);

  const since = startOfLocalDay();
  const todayMoves = await movements
    .find({ productId, createdAt: { $gte: since } })
    .sort({ createdAt: 1 })
    .toArray();
  const types = todayMoves.map((m) => `${m.type}:${m.quantityDelta}`);
  console.log("6) Movements for product today:", types.join(", "));
  assert.ok(todayMoves.some((m) => m.type === MOVEMENT_TYPE.adminAdjust && m.quantityDelta === 20));
  assert.ok(todayMoves.some((m) => m.type === MOVEMENT_TYPE.sale && m.quantityDelta === -3));
  assert.ok(todayMoves.some((m) => m.type === MOVEMENT_TYPE.void && m.quantityDelta === 3));

  const saleDoc = await sales.findOne({ _id: saleId });
  assert.equal(saleDoc.status, SALE_STATUS.voided);
  console.log("7) Sale status is voided; void reason:", saleDoc.voidReason);

  console.log("\nPhase 1b demo PASSED");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await client.close();
  });
