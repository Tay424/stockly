import assert from "node:assert/strict";
import { test } from "node:test";

import {
  MOVEMENT_TYPE,
  SALE_STATUS,
  effectiveSaleStatus,
  findDiscrepancies,
  isSameLocalDay,
  startOfLocalDay,
} from "./stock-ledger.js";

test("effectiveSaleStatus treats missing status as recorded", () => {
  assert.equal(effectiveSaleStatus({}), SALE_STATUS.recorded);
  assert.equal(effectiveSaleStatus({ status: SALE_STATUS.voided }), SALE_STATUS.voided);
});

test("isSameLocalDay compares calendar days in local time", () => {
  const morning = new Date(2026, 7, 5, 9, 0, 0);
  const evening = new Date(2026, 7, 5, 22, 0, 0);
  const nextDay = new Date(2026, 7, 6, 1, 0, 0);
  assert.equal(isSameLocalDay(morning, evening), true);
  assert.equal(isSameLocalDay(morning, nextDay), false);
});

test("findDiscrepancies is clean when sale and movement match", () => {
  const start = startOfLocalDay(new Date(2026, 7, 5));
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const sales = [
    {
      id: "s1",
      productId: "p1",
      productName: "Soap",
      quantity: 2,
      status: SALE_STATUS.recorded,
      createdAt: new Date(2026, 7, 5, 10).toISOString(),
    },
  ];
  const movements = [
    {
      id: "m1",
      type: MOVEMENT_TYPE.sale,
      productId: "p1",
      productName: "Soap",
      quantityDelta: -2,
      refId: "s1",
      createdAt: new Date(2026, 7, 5, 10).toISOString(),
    },
  ];

  const { products, discrepancies } = findDiscrepancies(sales, movements, { start, end });
  assert.equal(discrepancies.length, 0);
  assert.equal(products[0].ok, true);
  assert.equal(products[0].soldUnits, 2);
  assert.equal(products[0].saleMovementUnits, 2);
});

test("findDiscrepancies flags a sale with no movement", () => {
  const start = startOfLocalDay(new Date(2026, 7, 5));
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const sales = [
    {
      id: "s1",
      productId: "p1",
      productName: "Soap",
      quantity: 1,
      status: SALE_STATUS.recorded,
      createdAt: new Date(2026, 7, 5, 10).toISOString(),
    },
  ];

  const { discrepancies } = findDiscrepancies(sales, [], { start, end });
  assert.equal(discrepancies.some((d) => d.kind === "sale_missing_movement"), true);
});

test("findDiscrepancies requires a void movement for sales voided in-window", () => {
  const start = startOfLocalDay(new Date(2026, 7, 5));
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const sales = [
    {
      id: "s1",
      productId: "p1",
      productName: "Soap",
      quantity: 3,
      status: SALE_STATUS.voided,
      createdAt: new Date(2026, 7, 4, 10).toISOString(),
      voidedAt: new Date(2026, 7, 5, 12).toISOString(),
    },
  ];
  const movements = [
    {
      id: "m1",
      type: MOVEMENT_TYPE.void,
      productId: "p1",
      productName: "Soap",
      quantityDelta: 3,
      refId: "s1",
      createdAt: new Date(2026, 7, 5, 12).toISOString(),
    },
  ];

  const { products, discrepancies } = findDiscrepancies(sales, movements, { start, end });
  assert.equal(
    discrepancies.some((d) => d.kind === "void_missing_movement"),
    false,
  );
  assert.equal(products[0].voidedUnits, 3);
  assert.equal(products[0].voidMovementUnits, 3);
  assert.equal(products[0].ok, true);
});

test("findDiscrepancies does not require today's sale movement for an older voided sale", () => {
  const start = startOfLocalDay(new Date(2026, 7, 5));
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const sales = [
    {
      id: "s1",
      productId: "p1",
      productName: "Soap",
      quantity: 1,
      status: SALE_STATUS.voided,
      createdAt: new Date(2026, 7, 1, 10).toISOString(),
      voidedAt: new Date(2026, 7, 5, 12).toISOString(),
    },
  ];

  const { discrepancies } = findDiscrepancies(sales, [], { start, end });
  assert.equal(
    discrepancies.some((d) => d.kind === "sale_missing_movement"),
    false,
  );
  assert.equal(
    discrepancies.some((d) => d.kind === "void_missing_movement"),
    true,
  );
});
