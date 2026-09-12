/**
 * One-shot: move Nhava Salt to its own category and reprice historical sales.
 * Usage: node --env-file=.env scripts/reprice-nhava-sales.js
 */
import { MongoClient, ObjectId } from "mongodb";
import { nhavaQuantityOnSale, repriceSaleNhava } from "../lib/nhava-reprice.js";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

const NHAVA_NAME = "Nhava Salt";
const RETAIL_PACK_QTY = 1;
const RETAIL_PACK_PRICE_CENTS = 3000;
const WHOLESALE_PACK_QTY = 5;
const WHOLESALE_PACK_PRICE_CENTS = 6000;

function toId(value) {
  if (value == null || value === "") return value;
  if (value instanceof ObjectId) return value;
  return ObjectId.isValid(String(value)) ? new ObjectId(String(value)) : value;
}

function withObjectIds(sale) {
  const mapPack = (pack) => ({
    ...pack,
    categoryId: toId(pack.categoryId),
    contributions: (pack.contributions ?? []).map((c) => ({
      ...c,
      productId: toId(c.productId),
    })),
  });
  return {
    ...sale,
    lines: (sale.lines ?? []).map((line) => ({
      ...line,
      productId: toId(line.productId),
      categoryId: toId(line.categoryId),
    })),
    packs: (sale.packs ?? []).map(mapPack),
    retailPacks: (sale.retailPacks ?? []).map(mapPack),
    retailLines: (sale.retailLines ?? []).map((line) => ({
      ...line,
      productId: toId(line.productId),
      categoryId: toId(line.categoryId),
    })),
    productId: sale.lines?.[0]?.productId
      ? toId(sale.lines[0].productId)
      : toId(sale.productId),
  };
}

const client = new MongoClient(uri);
await client.connect();
const db = client.db();
const now = new Date();

let category = await db.collection("category").findOne({ name: NHAVA_NAME });
if (!category) {
  const { insertedId } = await db.collection("category").insertOne({
    name: NHAVA_NAME,
    description: "Nhava Salt — sold as ones at $30, or packs of 5 at $60.",
    wholesalePackQty: WHOLESALE_PACK_QTY,
    wholesalePackPriceCents: WHOLESALE_PACK_PRICE_CENTS,
    retailPackQty: RETAIL_PACK_QTY,
    retailPackPriceCents: RETAIL_PACK_PRICE_CENTS,
    createdAt: now,
    updatedAt: now,
  });
  category = await db.collection("category").findOne({ _id: insertedId });
  console.log("Created category", String(category._id));
} else {
  await db.collection("category").updateOne(
    { _id: category._id },
    {
      $set: {
        wholesalePackQty: WHOLESALE_PACK_QTY,
        wholesalePackPriceCents: WHOLESALE_PACK_PRICE_CENTS,
        retailPackQty: RETAIL_PACK_QTY,
        retailPackPriceCents: RETAIL_PACK_PRICE_CENTS,
        updatedAt: now,
      },
    },
  );
  category = await db.collection("category").findOne({ _id: category._id });
  console.log("Updated category", String(category._id));
}

const product = await db.collection("product").findOne({ name: NHAVA_NAME });
if (!product) {
  console.error("Nhava Salt product not found");
  await client.close();
  process.exit(1);
}

await db.collection("product").updateOne(
  { _id: product._id },
  {
    $set: {
      categoryId: category._id,
      retailPriceCents: RETAIL_PACK_PRICE_CENTS,
      updatedAt: now,
    },
  },
);
console.log("Product moved to Nhava Salt category; retail $30");

const aura = await db.collection("category").findOne({ name: /aura salts?/i });
if (aura?.description && /nhava/i.test(aura.description)) {
  const cleaned = String(aura.description)
    .replace(/\s*,\s*Nhava\s*,/i, ", ")
    .replace(/\s*,\s*Nhava\s*$/i, "")
    .replace(/^Nhava\s*,\s*/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  await db.collection("category").updateOne(
    { _id: aura._id },
    { $set: { description: cleaned, updatedAt: now } },
  );
  console.log("Removed Nhava from Aura Salts description");
}

const nhavaProductId = String(product._id);
const nhavaProduct = {
  id: nhavaProductId,
  name: product.name,
  retailPriceCents: RETAIL_PACK_PRICE_CENTS,
};
const nhavaCategory = {
  id: String(category._id),
  name: category.name,
  wholesalePackQty: WHOLESALE_PACK_QTY,
  wholesalePackPriceCents: WHOLESALE_PACK_PRICE_CENTS,
  retailPackQty: RETAIL_PACK_QTY,
  retailPackPriceCents: RETAIL_PACK_PRICE_CENTS,
};

const force = process.argv.includes("--force");

const candidates = await db
  .collection("sale")
  .find({
    status: { $ne: "voided" },
    $or: [
      { productId: product._id },
      { productId: nhavaProductId },
      { "lines.productId": product._id },
      { "lines.productId": nhavaProductId },
      { productName: /nhava/i },
      { "lines.productName": /nhava/i },
      { "retailLines.productName": /nhava/i },
    ],
  })
  .toArray();

console.log("Candidate sales:", candidates.length);

const updates = [];
const skipped = [];

for (const row of candidates) {
  if (nhavaQuantityOnSale(row, nhavaProductId) <= 0) {
    skipped.push({ saleId: String(row._id), reason: "No Nhava quantity." });
    continue;
  }
  if (row.nhavaRepricedAt && !force) {
    skipped.push({ saleId: String(row._id), reason: "Already repriced." });
    continue;
  }

  const result = repriceSaleNhava(row, { nhavaProduct, nhavaCategory });
  if (!result.ok) {
    skipped.push({ saleId: String(row._id), reason: result.reason });
    continue;
  }

  const forDb = withObjectIds(result.sale);
  await db.collection("sale").updateOne(
    { _id: row._id },
    {
      $set: {
        productName: forDb.productName,
        productId: forDb.productId,
        totalCents: forDb.totalCents,
        wholesale: forDb.wholesale,
        lines: forDb.lines,
        packs: forDb.packs,
        retailPacks: forDb.retailPacks,
        retailLines: forDb.retailLines,
        nhavaRepricedAt: now,
        nhavaRepriceMeta: result.meta,
      },
    },
  );
  updates.push(result.meta);
  console.log(
    `Updated ${result.meta.saleId}: qty ${result.meta.nhavaQty} | Nhava $${(result.meta.oldNhavaCents / 100).toFixed(2)} → $${(result.meta.newNhavaCents / 100).toFixed(2)} | sale total $${(result.meta.oldTotalCents / 100).toFixed(2)} → $${(result.meta.newTotalCents / 100).toFixed(2)}`,
  );
}

console.log(
  JSON.stringify(
    {
      ok: true,
      updatedCount: updates.length,
      skippedCount: skipped.length,
      updates,
      skipped,
    },
    null,
    2,
  ),
);

await client.close();
