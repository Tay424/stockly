/**
 * Smoke: wholesale sale upserts distributor, invoice loader auth shape,
 * attendant 24h filter.
 *
 * Usage: node --env-file=.env scripts/demo-invoice-distributors.js
 */
import { ObjectId } from "mongodb";

import { listSellableProducts, recordSaleReceipt, listSalesBySeller, getSaleById } from "../lib/catalog.js";
import { listDistributorPerformance, normalizePhone, upsertDistributor } from "../lib/distributors.js";
import { priceReceipt } from "../lib/pricing.js";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const phone = normalizePhone("+263 77 123 4567");
assert(phone === "+263771234567", `normalizePhone failed: ${phone}`);

const upsert = await upsertDistributor({
  name: "Demo Distro",
  phone: "+263 77 123 4567",
  bumpSale: false,
});
assert(upsert.ok, upsert.reason ?? "upsert failed");

const products = await listSellableProducts();
assert(products.length > 0, "Need sellable products — seed stock first.");

const byCat = new Map();
for (const p of products) {
  if (!p.categoryId) continue;
  if (!byCat.has(p.categoryId)) byCat.set(p.categoryId, []);
  byCat.get(p.categoryId).push(p);
}

let packCategory = null;
let packQty = 0;
for (const [catId, list] of byCat) {
  const q = Number(list[0]?.wholesalePackQty) || 0;
  if (q > 0) {
    packCategory = list;
    packQty = q;
    break;
  }
}
assert(packCategory, "Need a category with wholesalePackQty > 0");

const stockLines = [];
let remaining = packQty;
for (const p of packCategory) {
  if (remaining <= 0) break;
  const take = Math.min(p.stock, remaining);
  if (take < 1) continue;
  stockLines.push({ productId: p.id, quantity: take });
  remaining -= take;
}
assert(remaining === 0, `Not enough stock to fill one pack of ${packQty}`);

const categoriesById = new Map();
const productsById = new Map();
for (const p of products) {
  productsById.set(p.id, p);
  if (p.categoryId && !categoriesById.has(p.categoryId)) {
    categoriesById.set(p.categoryId, {
      id: p.categoryId,
      name: p.categoryName,
      wholesalePackQty: p.wholesalePackQty ?? 0,
      wholesalePackPriceCents: p.wholesalePackPriceCents ?? 0,
    });
  }
}

const priced = priceReceipt(stockLines, productsById, categoriesById);
assert(priced.ok && priced.wholesale, "Expected wholesale pack pricing");

const sellerId = new ObjectId().toString();
const recorded = await recordSaleReceipt({
  cartLines: stockLines,
  saleMeta: { soldBy: sellerId, soldByName: "Demo Seller" },
  client: { name: "Demo Distro", phone: "+263771234567" },
});
assert(recorded.ok, recorded.reason ?? "recordSaleReceipt failed");
assert(recorded.saleId, "saleId missing");

const sale = await getSaleById(recorded.saleId);
assert(sale, "getSaleById failed");
assert(sale.clientName === "Demo Distro", "clientName not stored");
assert(sale.distributorId, "distributorId not linked");

const recent = await listSalesBySeller(sellerId, 50, { sinceHours: 24 });
assert(
  recent.some((s) => s.id === recorded.saleId),
  "Sale should appear in 24h list",
);

const perf = await listDistributorPerformance();
const row = perf.find((d) => d.id === sale.distributorId);
assert(row, "Distributor missing from performance list");
assert((row.saleCount ?? 0) >= 1, "Expected saleCount >= 1");

console.log(
  JSON.stringify(
    {
      ok: true,
      saleId: recorded.saleId,
      totalCents: recorded.totalCents,
      distributorId: sale.distributorId,
      revenueCents: row.revenueCents,
      invoicePath: `/dashboard/sales/${recorded.saleId}/invoice`,
    },
    null,
    2,
  ),
);
