import assert from "node:assert/strict";
import { test } from "node:test";

import {
  bucketSalesByHour,
  formatHourLabel,
  groupSalesByAttendant,
  summarizeSales,
} from "./charts.js";

test("formatHourLabel uses 12-hour clock", () => {
  assert.equal(formatHourLabel(0), "12am");
  assert.equal(formatHourLabel(9), "9am");
  assert.equal(formatHourLabel(12), "12pm");
  assert.equal(formatHourLabel(15), "3pm");
});

test("bucketSalesByHour totals into local hours and trims the window", () => {
  const sales = [
    {
      createdAt: new Date(2026, 7, 5, 9, 15).toISOString(),
      totalCents: 500,
      quantity: 1,
    },
    {
      createdAt: new Date(2026, 7, 5, 9, 45).toISOString(),
      totalCents: 700,
      quantity: 2,
    },
    {
      createdAt: new Date(2026, 7, 5, 14, 0).toISOString(),
      totalCents: 300,
      quantity: 1,
    },
  ];

  const buckets = bucketSalesByHour(sales);
  const nine = buckets.find((b) => b.hour === 9);
  const fourteen = buckets.find((b) => b.hour === 14);
  assert.ok(nine);
  assert.equal(nine.revenueCents, 1200);
  assert.equal(nine.unitsSold, 3);
  assert.equal(nine.saleCount, 2);
  assert.equal(fourteen.revenueCents, 300);
  assert.equal(buckets[0].hour, 6);
  assert.equal(buckets.at(-1).hour, 21);
});

test("summarizeSales and groupSalesByAttendant ignore nothing and sort by revenue", () => {
  const sales = [
    { soldBy: "a", soldByName: "Ada", totalCents: 100, quantity: 1 },
    { soldBy: "b", soldByName: "Bea", totalCents: 500, quantity: 2 },
    { soldBy: "a", soldByName: "Ada", totalCents: 50, quantity: 1 },
  ];
  assert.deepEqual(summarizeSales(sales), {
    revenueCents: 650,
    unitsSold: 4,
    saleCount: 3,
  });
  const byPerson = groupSalesByAttendant(sales);
  assert.equal(byPerson[0].soldByName, "Bea");
  assert.equal(byPerson[1].revenueCents, 150);
});
