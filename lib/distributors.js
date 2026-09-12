import "server-only";

import { ObjectId } from "mongodb";

import { db } from "./db.js";
import { SALE_STATUS } from "./stock-ledger.js";

const distributors = () => db.collection("distributor");

export function toDistributorObjectId(id) {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
}

/** Keep digits and a leading + for stable phone matching. */
export function normalizePhone(phone) {
  const raw = String(phone ?? "").trim();
  if (!raw) return "";
  const hasPlus = raw.startsWith("+");
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  return hasPlus ? `+${digits}` : digits;
}

function serializeDistributor({ _id, ...rest }) {
  return {
    id: String(_id),
    ...rest,
    createdAt: rest.createdAt?.toISOString?.() ?? rest.createdAt ?? null,
    updatedAt: rest.updatedAt?.toISOString?.() ?? rest.updatedAt ?? null,
    lastSaleAt: rest.lastSaleAt?.toISOString?.() ?? rest.lastSaleAt ?? null,
  };
}

export async function listDistributors({ limit = 200 } = {}) {
  const rows = await distributors().find({}).sort({ name: 1 }).limit(limit).toArray();
  return rows.map(serializeDistributor);
}

/**
 * Upsert by normalized phone. Updates name when the same phone returns.
 * Optionally bumps lastSaleAt when `bumpSale` is true (saleCount comes from aggregates).
 */
export async function upsertDistributor({ name, phone, bumpSale = false, now = new Date() }) {
  const trimmedName = String(name ?? "").trim();
  const normalized = normalizePhone(phone);
  if (!trimmedName) return { ok: false, reason: "Client name is required." };
  if (!normalized) return { ok: false, reason: "Client phone is required." };

  const existing = await distributors().findOne({ phone: normalized });
  if (existing) {
    const $set = {
      name: trimmedName,
      updatedAt: now,
    };
    if (bumpSale) $set.lastSaleAt = now;
    await distributors().updateOne({ _id: existing._id }, { $set });
    return {
      ok: true,
      distributor: serializeDistributor({
        ...existing,
        ...$set,
      }),
    };
  }

  const doc = {
    name: trimmedName,
    phone: normalized,
    lastSaleAt: bumpSale ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await distributors().insertOne(doc);
  return {
    ok: true,
    distributor: serializeDistributor({ _id: insertedId, ...doc }),
  };
}

/**
 * Distributor directory with performance from non-voided linked sales.
 * Sorted by revenue desc by default.
 */
export async function listDistributorPerformance() {
  const rows = await distributors()
    .aggregate([
      {
        $lookup: {
          from: "sale",
          let: { distributorId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$distributorId", "$$distributorId"] },
                status: { $ne: SALE_STATUS.voided },
              },
            },
            {
              $group: {
                _id: null,
                saleCount: { $sum: 1 },
                unitsSold: { $sum: "$quantity" },
                revenueCents: { $sum: "$totalCents" },
                lastSaleAt: { $max: "$createdAt" },
              },
            },
          ],
          as: "stats",
        },
      },
      {
        $addFields: {
          stats: { $ifNull: [{ $arrayElemAt: ["$stats", 0] }, null] },
        },
      },
      {
        $project: {
          name: 1,
          phone: 1,
          createdAt: 1,
          updatedAt: 1,
          saleCount: { $ifNull: ["$stats.saleCount", 0] },
          unitsSold: { $ifNull: ["$stats.unitsSold", 0] },
          revenueCents: { $ifNull: ["$stats.revenueCents", 0] },
          lastSaleAt: { $ifNull: ["$stats.lastSaleAt", "$lastSaleAt"] },
        },
      },
      { $sort: { revenueCents: -1, name: 1 } },
    ])
    .toArray();

  return rows.map(serializeDistributor);
}
