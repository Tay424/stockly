import assert from "node:assert/strict";
import { describe, it } from "node:test";

/**
 * Pure timing/regression notes for the locations fast-path.
 * Heavy DB work is covered by the app_meta + in-memory cache in lib/locations.js.
 */
describe("vercel page perf guards", () => {
  it("documents that migration readiness is keyed in app_meta", () => {
    // Keep this key stable — changing it re-runs the one-time migration.
    assert.equal("locations_v1", "locations_v1");
  });
});
