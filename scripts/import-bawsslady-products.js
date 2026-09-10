/**
 * Import active products from bawssladychichi.com (public Supabase catalog)
 * into Stockly. Images are downloaded to public/products. Prices are set to
 * $0 USD placeholders; category is a holding "Imported" bucket for you to reassign.
 *
 * Run: node --env-file=.env scripts/import-bawsslady-products.js
 * Re-run is safe: matches on importHandle and updates name/description/image.
 */
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { MongoClient } from "mongodb";

const SOURCE = "bawssladychichi";
const SUPABASE_URL = "https://zjpdvzaypvpkmuxkqtuq.supabase.co";
const SUPABASE_KEY = "sb_publishable_lEYonrdDjXabUt-MV5ygLA_IaeFm0PL";
const HOLDING_CATEGORY = "Imported — assign category";

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error("MONGODB_URI is not set");

function extensionFromUrl(url, contentType) {
  const lower = String(url).toLowerCase().split("?")[0];
  if (lower.endsWith(".png") || contentType?.includes("png")) return "png";
  if (lower.endsWith(".webp") || contentType?.includes("webp")) return "webp";
  if (lower.endsWith(".jpeg") || lower.endsWith(".jpg") || contentType?.includes("jpeg"))
    return "jpg";
  return "jpg";
}

async function fetchCatalog() {
  const url = `${SUPABASE_URL}/rest/v1/products?select=*&is_active=eq.true&order=title.asc`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`Catalog fetch failed: ${res.status}`);
  return res.json();
}

async function listStorageImages(apiKey) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/product-images`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ prefix: "products/", limit: 200 }),
  });
  if (!res.ok) return [];
  const rows = await res.json();
  return Array.isArray(rows) ? rows.map((r) => r.name).filter(Boolean) : [];
}

async function signStorageObject(apiKey, objectPath) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/sign/product-images/${objectPath}`, {
    method: "POST",
    headers: {
      apikey: apiKey,
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ expiresIn: 3600 }),
  });
  if (!res.ok) return null;
  const data = await res.json();
  const signed = data.signedURL || data.signedUrl;
  if (!signed) return null;
  return signed.startsWith("http") ? signed : `${SUPABASE_URL}/storage/v1${signed}`;
}

function candidateImageUrls(row) {
  const urls = [];
  if (row.image_url) urls.push(row.image_url);
  for (const u of row.image_urls || []) if (u) urls.push(u);
  return [...new Set(urls)];
}

function matchStorageFile(handle, title, storageNames) {
  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "");
  const h = norm(handle);
  const t = norm(title);
  let best = null;
  let bestScore = 0;
  for (const name of storageNames) {
    const n = norm(name);
    let score = 0;
    if (h && n.includes(h)) score += 5;
    // token overlap on title words length >= 4
    const tokens = String(title || "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 4);
    for (const tok of tokens) {
      if (n.includes(tok)) score += 1;
    }
    if (t && n.includes(t.slice(0, 12))) score += 2;
    if (score > bestScore) {
      bestScore = score;
      best = name;
    }
  }
  return bestScore >= 3 ? best : null;
}

async function downloadImage(imageUrl, handle) {
  if (!imageUrl) return null;
  const res = await fetch(imageUrl, {
    headers: { "User-Agent": "StocklyImport/1.0" },
    redirect: "follow",
  });
  if (!res.ok) {
    console.warn(`  image skip ${handle}: HTTP ${res.status}`);
    return null;
  }
  const ext = extensionFromUrl(imageUrl, res.headers.get("content-type"));
  const key = `bawss-${handle}.${ext}`;
  const dir = path.join(process.cwd(), "public", "products");
  await mkdir(dir, { recursive: true });
  const filePath = path.join(dir, key);
  await pipeline(Readable.fromWeb(res.body), createWriteStream(filePath));
  return {
    imageUrl: `/products/${key}`,
    imageKey: key,
    imageMime: res.headers.get("content-type") || `image/${ext === "jpg" ? "jpeg" : ext}`,
    imageName: key,
  };
}

async function resolveImage(row, apiKey, storageNames) {
  for (const url of candidateImageUrls(row)) {
    const got = await downloadImage(url, row.handle);
    if (got) return got;
  }
  const matched = matchStorageFile(row.handle, row.title, storageNames);
  if (matched) {
    const signed = await signStorageObject(apiKey, `products/${matched}`);
    if (signed) {
      const got = await downloadImage(signed, row.handle);
      if (got) {
        console.log(`  image via storage match ${row.handle} <- ${matched}`);
        return got;
      }
    }
  }
  return null;
}

function buildDescription(row) {
  const parts = [];
  if (row.short_description?.trim()) parts.push(row.short_description.trim());
  if (row.long_description?.trim() && row.long_description.trim() !== row.short_description?.trim()) {
    parts.push(row.long_description.trim());
  }
  if (row.ingredients?.trim()) parts.push(`Ingredients: ${row.ingredients.trim()}`);
  if (row.benefits?.trim()) parts.push(`Benefits: ${row.benefits.trim()}`);
  if (row.usage_instructions?.trim()) parts.push(`How to use: ${row.usage_instructions.trim()}`);
  const zar = row.price_amount != null ? `Source list price: R${Number(row.price_amount)} (set USD in Stockly).` : null;
  if (zar) parts.push(zar);
  return parts.join("\n\n").slice(0, 4000);
}

async function main() {
  const catalog = await fetchCatalog();
  console.log(`Fetched ${catalog.length} active products from bawssladychichi.com`);

  const storageNames = await listStorageImages(SUPABASE_KEY);
  console.log(`Supabase storage images available: ${storageNames.length}`);

  const client = new MongoClient(uri);
  await client.connect();
  const db = client.db();
  const categories = db.collection("category");
  const products = db.collection("product");
  const now = new Date();

  let category = await categories.findOne({ name: HOLDING_CATEGORY });
  if (!category) {
    const { insertedId } = await categories.insertOne({
      name: HOLDING_CATEGORY,
      description:
        "Holding category for bawssladychichi.com import. Reassign each product, then delete this category.",
      wholesalePackQty: 0,
      wholesalePackPriceCents: 0,
      createdAt: now,
      updatedAt: now,
    });
    category = { _id: insertedId };
    console.log(`Created category: ${HOLDING_CATEGORY}`);
  } else {
    console.log(`Using existing category: ${HOLDING_CATEGORY}`);
  }

  let created = 0;
  let updated = 0;
  let images = 0;

  for (const row of catalog) {
    const handle = String(row.handle || row.id);
    const title = String(row.title || "").trim();
    if (!title) continue;

    let imageFields = null;
    try {
      imageFields = await resolveImage(row, SUPABASE_KEY, storageNames);
      if (imageFields) images += 1;
    } catch (err) {
      console.warn(`  image error ${handle}:`, err.message);
    }

    const doc = {
      name: title,
      description: buildDescription(row),
      categoryId: category._id,
      retailPriceCents: 0,
      wholesalePriceCents: 0,
      wholesaleMinQty: 0,
      stock: 0,
      discountPercent: 0,
      discountStartsAt: null,
      discountEndsAt: null,
      importSource: SOURCE,
      importHandle: handle,
      importZarAmount: row.price_amount ?? null,
      updatedAt: now,
      ...(imageFields || {}),
    };

    const existing = await products.findOne({ importSource: SOURCE, importHandle: handle });
    if (existing) {
      const $set = { ...doc };
      // Keep existing image if download failed this run.
      if (!imageFields) {
        delete $set.imageUrl;
        delete $set.imageKey;
        delete $set.imageMime;
        delete $set.imageName;
      }
      // Don't overwrite category/pricing/stock if an admin already edited them
      // after a previous import — only refresh catalog text/image when still in holding.
      const stillHolding = String(existing.categoryId) === String(category._id);
      if (!stillHolding) {
        delete $set.categoryId;
        delete $set.retailPriceCents;
        delete $set.wholesalePriceCents;
        delete $set.wholesaleMinQty;
        delete $set.stock;
      }
      await products.updateOne({ _id: existing._id }, { $set });
      updated += 1;
      console.log(`updated  ${title}`);
    } else {
      await products.insertOne({
        ...doc,
        imageUrl: imageFields?.imageUrl ?? null,
        imageKey: imageFields?.imageKey ?? null,
        imageMime: imageFields?.imageMime ?? null,
        imageName: imageFields?.imageName ?? null,
        createdAt: now,
      });
      created += 1;
      console.log(`created  ${title}`);
    }
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        created,
        updated,
        imagesDownloaded: images,
        totalCatalog: catalog.length,
        holdingCategory: HOLDING_CATEGORY,
        note: "Set USD prices and move products into real categories in Admin → Products.",
      },
      null,
      2,
    ),
  );

  await client.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
