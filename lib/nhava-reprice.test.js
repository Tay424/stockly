import assert from "node:assert/strict";
import { test } from "node:test";

import { repriceSaleNhava, nhavaQuantityOnSale } from "./nhava-reprice.js";

const nhavaProduct = {
  id: "nhava1",
  name: "Nhava Salt",
  retailPriceCents: 3000,
};

const nhavaCategory = {
  id: "cat-nhava",
  name: "Nhava Salt",
  wholesalePackQty: 5,
  wholesalePackPriceCents: 6000,
  retailPackQty: 1,
  retailPackPriceCents: 3000,
};

function baseSale({ nhavaQty, nhavaLineTotalCents }) {
  return {
    _id: "sale1",
    productName: "Nhava Salt +2",
    totalCents: 4000 + nhavaLineTotalCents,
    wholesale: true,
    lines: [
      {
        productId: "aura1",
        productName: "Mwenje Salt",
        categoryId: "cat-aura",
        categoryName: "Aura Salts",
        quantity: 10,
        packUnits: 10,
        retailUnits: 0,
      },
      {
        productId: "nhava1",
        productName: "Nhava Salt",
        categoryId: "cat-aura",
        categoryName: "Aura Salts",
        quantity: nhavaQty,
        packUnits: 0,
        retailUnits: nhavaQty,
        unitPriceCents: 1000,
        lineTotalCents: nhavaLineTotalCents,
      },
    ],
    packs: [
      {
        categoryId: "cat-aura",
        categoryName: "Aura Salts",
        packCount: 1,
        packQty: 10,
        packPriceCents: 4000,
        totalCents: 4000,
        contributions: [
          { productId: "aura1", productName: "Mwenje Salt", quantity: 10 },
        ],
      },
    ],
    retailPacks: [],
    retailLines: [
      {
        productId: "nhava1",
        productName: "Nhava Salt",
        categoryId: "cat-aura",
        categoryName: "Aura Salts",
        quantity: nhavaQty,
        unitPriceCents: 1000,
        lineTotalCents: nhavaLineTotalCents,
      },
    ],
  };
}

test("nhava quantity from lines", () => {
  const sale = baseSale({ nhavaQty: 6, nhavaLineTotalCents: 6000 });
  assert.equal(nhavaQuantityOnSale(sale, "nhava1"), 6);
});

test("6 units → 1 wholesale pack ($60) + 1 retail ($30) = $90", () => {
  const sale = baseSale({ nhavaQty: 6, nhavaLineTotalCents: 6000 });
  const result = repriceSaleNhava(sale, { nhavaProduct, nhavaCategory });
  assert.equal(result.ok, true);
  assert.equal(result.meta.newNhavaCents, 9000);
  assert.equal(result.meta.oldNhavaCents, 6000);
  assert.equal(result.meta.deltaCents, 3000);
  assert.equal(result.sale.totalCents, 4000 + 9000);
  assert.equal(result.sale.packs.filter((p) => p.categoryName === "Nhava Salt").length, 1);
  assert.equal(result.sale.retailPacks.filter((p) => p.categoryName === "Nhava Salt").length, 1);
  assert.equal(result.sale.retailLines.some((l) => l.productId === "nhava1"), false);
  const nhavaLine = result.sale.lines.find((l) => l.productId === "nhava1");
  assert.equal(nhavaLine.categoryName, "Nhava Salt");
  assert.equal(nhavaLine.packUnits, 5);
  assert.equal(nhavaLine.retailUnits, 1);
});

test("5 units → 1 wholesale pack ($60)", () => {
  const sale = baseSale({ nhavaQty: 5, nhavaLineTotalCents: 5000 });
  const result = repriceSaleNhava(sale, { nhavaProduct, nhavaCategory });
  assert.equal(result.ok, true);
  assert.equal(result.meta.newNhavaCents, 6000);
  assert.equal(result.sale.totalCents, 10000);
  assert.equal(result.sale.retailPacks.length, 0);
});

test("1 unit → 1 retail pack ($30)", () => {
  const sale = baseSale({ nhavaQty: 1, nhavaLineTotalCents: 1000 });
  const result = repriceSaleNhava(sale, { nhavaProduct, nhavaCategory });
  assert.equal(result.ok, true);
  assert.equal(result.meta.newNhavaCents, 3000);
  assert.equal(result.sale.packs.some((p) => p.categoryName === "Nhava Salt"), false);
  assert.equal(result.sale.retailPacks[0].totalCents, 3000);
});

test("10 units → 2 wholesale packs ($120)", () => {
  const sale = baseSale({ nhavaQty: 10, nhavaLineTotalCents: 10000 });
  const result = repriceSaleNhava(sale, { nhavaProduct, nhavaCategory });
  assert.equal(result.ok, true);
  assert.equal(result.meta.newNhavaCents, 12000);
  assert.equal(result.sale.packs.find((p) => p.categoryName === "Nhava Salt").packCount, 2);
});
