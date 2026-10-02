import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildMonthPerformanceRows,
  isNotMovingRow,
  monthPerformanceCounts,
  sortMonthMovers,
  sortNotMoving,
  sortPerformanceTable,
} from "./month-product-performance.js";

const fixtures = [
  {
    id: "1",
    productId: "a",
    productName: "Pink salt",
    sold: 0,
    closingStock: 40,
    openingStock: 40,
    received: 0,
  },
  {
    id: "2",
    productId: "b",
    productName: "Coca Cola",
    sold: 12,
    closingStock: 80,
    openingStock: 90,
    received: 10,
  },
  {
    id: "3",
    productId: "c",
    productName: "Dead SKU",
    sold: 0,
    closingStock: 0,
    openingStock: 0,
    received: 0,
  },
  {
    id: "4",
    productId: "d",
    productName: "Green salt",
    sold: 5,
    closingStock: 10,
    openingStock: 15,
    received: 0,
  },
];

test("not moving requires sold 0 and stock still on hand", () => {
  assert.equal(isNotMovingRow({ sold: 0, closingStock: 40 }), true);
  assert.equal(isNotMovingRow({ sold: 0, closingStock: 0 }), false);
  assert.equal(isNotMovingRow({ sold: 3, closingStock: 40 }), false);
  assert.equal(isNotMovingRow({ sold: 0, closingStock: -1 }), false);
});

test("buildMonthPerformanceRows joins category and flags notMoving", () => {
  const rows = buildMonthPerformanceRows(fixtures, {
    a: "Aura Salts",
    b: "Beverages",
    d: "Aura Salts",
  });
  assert.equal(rows.length, 4);
  assert.equal(rows[0].notMoving, true);
  assert.equal(rows[0].categoryName, "Aura Salts");
  assert.equal(rows[1].notMoving, false);
  assert.equal(rows[2].notMoving, false);
  assert.equal(rows[2].categoryName, null);
  assert.equal(rows[3].notMoving, false);
});

test("monthPerformanceCounts splits movers and not-moving", () => {
  const rows = buildMonthPerformanceRows(fixtures, {});
  const counts = monthPerformanceCounts(rows);
  assert.equal(counts.notMovingCount, 1);
  assert.equal(counts.movedCount, 2);
});

test("sortMonthMovers ranks by sold then name", () => {
  const rows = buildMonthPerformanceRows(fixtures, {});
  const top = sortMonthMovers(rows, 5);
  assert.deepEqual(
    top.map((r) => r.productName),
    ["Coca Cola", "Green salt"],
  );
  assert.equal(sortMonthMovers(rows, 1)[0].productName, "Coca Cola");
});

test("sortNotMoving ranks by closing stock", () => {
  const rows = buildMonthPerformanceRows(
    [
      ...fixtures,
      {
        id: "5",
        productId: "e",
        productName: "Stale bags",
        sold: 0,
        closingStock: 5,
        openingStock: 5,
        received: 0,
      },
    ],
    {},
  );
  const stuck = sortNotMoving(rows);
  assert.deepEqual(
    stuck.map((r) => r.productName),
    ["Pink salt", "Stale bags"],
  );
});

test("sortPerformanceTable defaults to sold desc; not-moving focus uses closing", () => {
  const rows = buildMonthPerformanceRows(fixtures, {});
  const bySold = sortPerformanceTable(rows);
  assert.equal(bySold[0].productName, "Coca Cola");

  const notMovingOnly = rows.filter((r) => r.notMoving);
  const byClosing = sortPerformanceTable(notMovingOnly, { focusNotMoving: true });
  assert.equal(byClosing[0].productName, "Pink salt");
});
