import "server-only";

import { db } from "./db.js";
import { toObjectId } from "./locations.js";

const prices = () => db.collection("location_price");

function serialize(row) {
  if (!row) return null;
  return {
    id: String(row._id),
    locationId: row.locationId ? String(row.locationId) : null,
    productId: row.productId ? String(row.productId) : null,
    categoryId: row.categoryId ? String(row.categoryId) : null,
    retailPriceCents: row.retailPriceCents ?? null,
    retailPackPriceCents: row.retailPackPriceCents ?? null,
    wholesalePackPriceCents: row.wholesalePackPriceCents ?? null,
  };
}

export async function listPricesForLocation(locationId) {
  const lid = toObjectId(locationId);
  if (!lid) return [];
  const rows = await prices().find({ locationId: lid }).toArray();
  return rows.map(serialize);
}

export async function listPricesForLocations(locationIds) {
  const ids = (locationIds ?? []).map(toObjectId).filter(Boolean);
  if (ids.length === 0) return [];
  const rows = await prices().find({ locationId: { $in: ids } }).toArray();
  return rows.map(serialize);
}

export async function upsertProductLocationPrice(locationId, productId, retailPriceCents) {
  const lid = toObjectId(locationId);
  const pid = toObjectId(productId);
  if (!lid || !pid) return { ok: false, reason: "Location and product are required." };
  if (!Number.isInteger(retailPriceCents) || retailPriceCents < 0) {
    return { ok: false, reason: "Price must be a valid amount." };
  }
  const now = new Date();
  await prices().updateOne(
    { locationId: lid, productId: pid },
    {
      $set: { retailPriceCents, updatedAt: now },
      $setOnInsert: { locationId: lid, productId: pid, createdAt: now },
      $unset: { categoryId: "" },
    },
    { upsert: true },
  );
  return { ok: true };
}

export async function upsertCategoryLocationPrice(
  locationId,
  categoryId,
  { retailPackPriceCents = null, wholesalePackPriceCents = null } = {},
) {
  const lid = toObjectId(locationId);
  const cid = toObjectId(categoryId);
  if (!lid || !cid) return { ok: false, reason: "Location and category are required." };
  const now = new Date();
  const set = { updatedAt: now };
  if (retailPackPriceCents != null) set.retailPackPriceCents = retailPackPriceCents;
  if (wholesalePackPriceCents != null) set.wholesalePackPriceCents = wholesalePackPriceCents;
  await prices().updateOne(
    { locationId: lid, categoryId: cid, productId: { $exists: false } },
    {
      $set: set,
      $setOnInsert: { locationId: lid, categoryId: cid, createdAt: now },
    },
    { upsert: true },
  );
  return { ok: true };
}
