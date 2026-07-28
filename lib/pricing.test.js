import assert from "node:assert/strict";
import { test } from "node:test";

import {
  applyDiscount,
  discountStatus,
  isDiscountActive,
  isWholesale,
  lineTotal,
  parseMoneyToCents,
  unitPriceFor,
} from "./pricing.js";

const product = {
  retailPriceCents: 250,
  wholesalePriceCents: 180,
  wholesaleMinQty: 12,
};

test("below the tier quantity everything is retail", () => {
  assert.equal(unitPriceFor(product, 1), 250);
  assert.equal(unitPriceFor(product, 11), 250);
  assert.equal(lineTotal(product, 11), 2750);
  assert.equal(isWholesale(product, 11), false);
});

test("at or above the tier quantity every unit is wholesale", () => {
  assert.equal(unitPriceFor(product, 12), 180);
  assert.equal(unitPriceFor(product, 100), 180);
  assert.equal(lineTotal(product, 12), 2160);
  assert.equal(isWholesale(product, 12), true);
});

test("wholesaleMinQty of 0 disables the tier", () => {
  const noTier = { ...product, wholesaleMinQty: 0 };
  assert.equal(unitPriceFor(noTier, 1000), 250);
  assert.equal(isWholesale(noTier, 1000), false);
});

const JAN = new Date("2026-01-10T12:00:00Z");
const FEB = new Date("2026-02-10T12:00:00Z");
const MAR = new Date("2026-03-10T12:00:00Z");

const onSale = {
  ...product,
  discountPercent: 20,
  discountStartsAt: "2026-02-01T00:00:00Z",
  discountEndsAt: "2026-03-01T00:00:00Z",
};

test("a discount only applies inside its window", () => {
  assert.equal(isDiscountActive(onSale, JAN), false);
  assert.equal(isDiscountActive(onSale, FEB), true);
  assert.equal(isDiscountActive(onSale, MAR), false);

  assert.equal(discountStatus(onSale, JAN), "scheduled");
  assert.equal(discountStatus(onSale, FEB), "active");
  assert.equal(discountStatus(onSale, MAR), "expired");
  assert.equal(discountStatus(product, FEB), "none");
});

test("the window is inclusive of the start and exclusive of the end", () => {
  assert.equal(isDiscountActive(onSale, new Date("2026-02-01T00:00:00Z")), true);
  assert.equal(isDiscountActive(onSale, new Date("2026-03-01T00:00:00Z")), false);
});

test("the discount comes off whichever tier price applies", () => {
  // retail 250 -> 200, wholesale 180 -> 144
  assert.equal(unitPriceFor(onSale, 1, FEB), 200);
  assert.equal(unitPriceFor(onSale, 12, FEB), 144);
  assert.equal(lineTotal(onSale, 12, FEB), 1728);

  // outside the window the tier prices are untouched
  assert.equal(unitPriceFor(onSale, 1, JAN), 250);
  assert.equal(unitPriceFor(onSale, 12, MAR), 180);
});

test("an open-ended discount never expires, a zero percent one never starts", () => {
  const forever = { ...onSale, discountEndsAt: null };
  assert.equal(isDiscountActive(forever, MAR), true);

  const zero = { ...onSale, discountPercent: 0 };
  assert.equal(isDiscountActive(zero, FEB), false);
  assert.equal(unitPriceFor(zero, 1, FEB), 250);
});

test("an unparseable date does not leave the discount open", () => {
  const broken = { ...onSale, discountStartsAt: "not a date", discountEndsAt: "nonsense" };
  // start is unknown so it cannot gate, but a broken end must not extend it either
  assert.equal(isDiscountActive(broken, FEB), true);
  assert.equal(isDiscountActive({ ...onSale, discountStartsAt: "junk" }, JAN), true);
});

test("discount rounds to whole cents", () => {
  assert.equal(applyDiscount(999, 10), 899); // 899.1
  assert.equal(applyDiscount(333, 33), 223); // 223.11
  assert.equal(applyDiscount(100, 100), 0);
});

test("money parsing rounds to cents and rejects junk", () => {
  assert.equal(parseMoneyToCents("12.50"), 1250);
  assert.equal(parseMoneyToCents("0.1"), 10);
  assert.equal(parseMoneyToCents("  3 "), 300);
  assert.equal(parseMoneyToCents("abc"), null);
  assert.equal(parseMoneyToCents("-5"), null);
  assert.equal(parseMoneyToCents(""), null);
});
