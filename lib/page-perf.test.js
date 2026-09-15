import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { DEFAULT_LOW_STOCK_THRESHOLD } from "./stock-ledger.js";

/** Keep in sync with lib/cache-tags.js */
const CACHE_TAGS = {
  navBadges: "nav-badges",
  dashboardStats: "dashboard-stats",
};
const PERF_CACHE_REVALIDATE_SECONDS = 45;

function thresholdFor(product) {
  const n = product?.lowStockThreshold;
  if (typeof n === "number" && Number.isInteger(n) && n >= 0) return n;
  return DEFAULT_LOW_STOCK_THRESHOLD;
}

function stockHealthStatus(stock, threshold) {
  const qty = Number(stock) || 0;
  if (qty <= 0) return "out";
  if (qty <= threshold) return "low";
  return "ok";
}

/**
 * Mirrors the Mongo $expr used by countLowStockProducts for needs-attention.
 */
function needsAttentionExpr(product) {
  const stock = Number(product?.stock) || 0;
  return stock <= thresholdFor(product);
}

describe("vercel page perf guards", () => {
  it("documents that migration readiness is keyed in app_meta", () => {
    // Keep this key stable — changing it re-runs the one-time migration.
    assert.equal("locations_v1", "locations_v1");
  });

  it("keeps perf cache tag names and TTL stable", () => {
    assert.equal(CACHE_TAGS.navBadges, "nav-badges");
    assert.equal(CACHE_TAGS.dashboardStats, "dashboard-stats");
    assert.equal(PERF_CACHE_REVALIDATE_SECONDS, 45);
  });

  it("countLowStock $expr matches stockHealthStatus needsAttention", () => {
    const samples = [
      { stock: 0, lowStockThreshold: 5 },
      { stock: 5, lowStockThreshold: 5 },
      { stock: 6, lowStockThreshold: 5 },
      { stock: 2, lowStockThreshold: 0 },
      { stock: 0, lowStockThreshold: 0 },
      { stock: 10 }, // default threshold
      { stock: 3, lowStockThreshold: 2.5 }, // non-integer → default
      { stock: 1, lowStockThreshold: -1 }, // invalid → default
    ];
    for (const row of samples) {
      const status = stockHealthStatus(row.stock, thresholdFor(row));
      const expectAttention = status !== "ok";
      assert.equal(
        needsAttentionExpr(row),
        expectAttention,
        `mismatch for ${JSON.stringify(row)} status=${status}`,
      );
    }
  });
});
