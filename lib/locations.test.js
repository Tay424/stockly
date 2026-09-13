import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  LOCATION_SLUGS,
  MOVEMENT_TYPE,
  TRANSFER_STATUS,
} from "./stock-ledger.js";

describe("location stock transfer constants", () => {
  it("seeds Harare hub, Gweru branch, and in-transit slugs", () => {
    assert.equal(LOCATION_SLUGS.harare, "harare");
    assert.equal(LOCATION_SLUGS.gweru, "gweru");
    assert.equal(LOCATION_SLUGS.inTransit, "in-transit");
  });

  it("defines send→confirm transfer movement and status values", () => {
    assert.equal(MOVEMENT_TYPE.transferOut, "transfer_out");
    assert.equal(MOVEMENT_TYPE.transferIn, "transfer_in");
    assert.equal(TRANSFER_STATUS.inTransit, "in_transit");
    assert.equal(TRANSFER_STATUS.completed, "completed");
    assert.equal(TRANSFER_STATUS.cancelled, "cancelled");
  });
});
