import { priceReceipt, saleProductSummary } from "./pricing.js";

const NHAVA_NAME_RE = /nhava/i;

export function isNhavaProductName(name) {
  return NHAVA_NAME_RE.test(String(name ?? ""));
}

export function sameProductId(a, b) {
  return String(a ?? "") === String(b ?? "");
}

/** Quantity of Nhava on a sale (from stock lines, else legacy top-level fields). */
export function nhavaQuantityOnSale(sale, nhavaProductId) {
  const pid = String(nhavaProductId);
  if (Array.isArray(sale?.lines) && sale.lines.length > 0) {
    return sale.lines.reduce((sum, line) => {
      if (sameProductId(line.productId, pid) || isNhavaProductName(line.productName)) {
        return sum + (Number(line.quantity) || 0);
      }
      return sum;
    }, 0);
  }
  if (sameProductId(sale?.productId, pid) || isNhavaProductName(sale?.productName)) {
    return Number(sale?.quantity) || 0;
  }
  return 0;
}

function contributionIsNhava(c, nhavaProductId) {
  return sameProductId(c.productId, nhavaProductId) || isNhavaProductName(c.productName);
}

/**
 * Strip Nhava out of packs / retail packs. When a pack is only Nhava, drop it
 * entirely and return its total as removed cents. When mixed, drop Nhava
 * contributions only (pack total stays — Aura packs in history were not mixed
 * with Nhava on invoices, but this keeps the transform safe).
 */
export function stripNhavaFromPacks(packs, nhavaProductId) {
  const kept = [];
  let removedCents = 0;

  for (const pack of packs ?? []) {
    const contributions = Array.isArray(pack.contributions) ? pack.contributions : [];
    const nhava = contributions.filter((c) => contributionIsNhava(c, nhavaProductId));
    const other = contributions.filter((c) => !contributionIsNhava(c, nhavaProductId));

    if (nhava.length === 0) {
      kept.push(pack);
      continue;
    }

    if (other.length === 0) {
      removedCents += Number(pack.totalCents) || 0;
      continue;
    }

    kept.push({ ...pack, contributions: other });
  }

  return { packs: kept, removedCents };
}

export function stripNhavaFromRetailLines(retailLines, nhavaProductId) {
  const kept = [];
  let removedCents = 0;
  for (const line of retailLines ?? []) {
    if (sameProductId(line.productId, nhavaProductId) || isNhavaProductName(line.productName)) {
      removedCents += Number(line.lineTotalCents) || 0;
      continue;
    }
    kept.push(line);
  }
  return { retailLines: kept, removedCents };
}

/**
 * Rebuild a sale document so Nhava units use the Nhava category pack pricing
 * (wholesale first, then retail packs). Other products/packs are left alone.
 *
 * Returns { ok, reason } or { ok: true, sale, meta }.
 */
export function repriceSaleNhava(sale, { nhavaProduct, nhavaCategory }) {
  const nhavaProductId = String(nhavaProduct.id ?? nhavaProduct._id);
  const qty = nhavaQuantityOnSale(sale, nhavaProductId);
  if (qty <= 0) {
    return { ok: false, reason: "Sale has no Nhava Salt quantity.", skipped: true };
  }

  const priced = priceReceipt(
    [{ productId: nhavaProductId, quantity: qty }],
    new Map([
      [
        nhavaProductId,
        {
          id: nhavaProductId,
          name: nhavaProduct.name ?? "Nhava Salt",
          categoryId: String(nhavaCategory.id ?? nhavaCategory._id),
          retailPriceCents: nhavaProduct.retailPriceCents ?? 3000,
        },
      ],
    ]),
    new Map([
      [
        String(nhavaCategory.id ?? nhavaCategory._id),
        {
          id: String(nhavaCategory.id ?? nhavaCategory._id),
          name: nhavaCategory.name ?? "Nhava Salt",
          wholesalePackQty: nhavaCategory.wholesalePackQty ?? 0,
          wholesalePackPriceCents: nhavaCategory.wholesalePackPriceCents ?? 0,
          retailPackQty: nhavaCategory.retailPackQty ?? 0,
          retailPackPriceCents: nhavaCategory.retailPackPriceCents ?? 0,
        },
      ],
    ]),
  );

  if (!priced.ok) {
    return { ok: false, reason: priced.reason };
  }

  const strippedPacks = stripNhavaFromPacks(sale.packs, nhavaProductId);
  const strippedRetailPacks = stripNhavaFromPacks(sale.retailPacks, nhavaProductId);
  const strippedRetail = stripNhavaFromRetailLines(sale.retailLines, nhavaProductId);

  const oldNhavaCents =
    strippedPacks.removedCents + strippedRetailPacks.removedCents + strippedRetail.removedCents;
  // Fallback when Nhava was only visible via $10 flat retail with no structured
  // attribution (should not happen on receipt sales, but keep totals honest).
  const inferredOldCents = oldNhavaCents > 0 ? oldNhavaCents : qty * 1000;

  const categoryId = String(nhavaCategory.id ?? nhavaCategory._id);
  const categoryName = nhavaCategory.name ?? "Nhava Salt";
  const productName = nhavaProduct.name ?? "Nhava Salt";

  const nhavaStockLine = priced.stockLines[0];
  const lines = (sale.lines ?? []).map((line) => {
    if (!(sameProductId(line.productId, nhavaProductId) || isNhavaProductName(line.productName))) {
      return line;
    }
    return {
      ...line,
      productName,
      categoryId,
      categoryName,
      packUnits: nhavaStockLine?.packUnits ?? 0,
      retailUnits: nhavaStockLine?.retailUnits ?? qty,
      unitPriceCents: nhavaStockLine?.unitPriceCents ?? null,
      lineTotalCents: nhavaStockLine?.lineTotalCents ?? 0,
    };
  });

  const packs = [...strippedPacks.packs, ...priced.packs];
  const retailPacks = [...strippedRetailPacks.packs, ...(priced.retailPacks ?? [])];
  const retailLines = [...strippedRetail.retailLines, ...priced.retailLines];

  const totalCents =
    packs.reduce((sum, pack) => sum + (Number(pack.totalCents) || 0), 0) +
    retailPacks.reduce((sum, pack) => sum + (Number(pack.totalCents) || 0), 0) +
    retailLines.reduce((sum, line) => sum + (Number(line.lineTotalCents) || 0), 0);

  const next = {
    ...sale,
    productName: saleProductSummary(lines),
    totalCents,
    wholesale: packs.length > 0,
    lines,
    packs,
    retailPacks,
    retailLines,
  };

  return {
    ok: true,
    sale: next,
    meta: {
      saleId: sale.id ?? String(sale._id ?? ""),
      nhavaQty: qty,
      oldNhavaCents: inferredOldCents,
      newNhavaCents: priced.totalCents,
      oldTotalCents: Number(sale.totalCents) || 0,
      newTotalCents: totalCents,
      deltaCents: priced.totalCents - inferredOldCents,
    },
  };
}
