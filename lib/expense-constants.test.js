import assert from "node:assert/strict";
import { test } from "node:test";

import {
  EXPENSE_STATUS,
  countsInBooks,
  effectiveExpenseStatus,
  isValidCategory,
} from "./expense-constants.js";

test("fixed categories include transport and misc", () => {
  assert.equal(isValidCategory("transport"), true);
  assert.equal(isValidCategory("misc"), true);
  assert.equal(isValidCategory("rent"), false);
});

test("legacy expenses without status count in the books as approved", () => {
  assert.equal(effectiveExpenseStatus({}), EXPENSE_STATUS.approved);
  assert.equal(countsInBooks({}), true);
  assert.equal(countsInBooks({ status: EXPENSE_STATUS.pending }), false);
  assert.equal(countsInBooks({ status: EXPENSE_STATUS.approved }), true);
});
