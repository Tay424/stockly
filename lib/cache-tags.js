import "server-only";

import { updateTag } from "next/cache";

/** Short-lived Next data-cache tags for admin nav + dashboard aggregates. */
export const CACHE_TAGS = {
  navBadges: "nav-badges",
  dashboardStats: "dashboard-stats",
};

/** ~45s TTL for warm reads; mutations call invalidatePerfCaches(). */
export const PERF_CACHE_REVALIDATE_SECONDS = 45;

/**
 * Invalidate server caches after stock/sale/expense/product writes.
 * Uses updateTag so the next read in this request / following navigation is fresh.
 */
export function invalidatePerfCaches() {
  updateTag(CACHE_TAGS.navBadges);
  updateTag(CACHE_TAGS.dashboardStats);
}
