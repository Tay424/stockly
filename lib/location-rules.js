/** Pure location, currency, and supply rules. No database. */

export const LOCATION_CURRENCIES = ["USD", "ZAR"];
export const DEFAULT_CURRENCY = "USD";

export const USUAL_SOURCES = {
  producedAtHarare: "produced_at_harare",
  fromJohannesburg: "from_johannesburg",
};

export const SOURCE_KIND = {
  produced: "produced",
  supplied: "supplied",
};

export function normalizeCurrency(value) {
  const code = String(value ?? "").trim().toUpperCase();
  return LOCATION_CURRENCIES.includes(code) ? code : DEFAULT_CURRENCY;
}

export function slugifyLocationName(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Salt products are usually made in Harare. Everything else usually arrives
 * from Johannesburg. Admin can override this on the product.
 */
export function usualSourceForName(name) {
  return /salt/i.test(String(name ?? ""))
    ? USUAL_SOURCES.producedAtHarare
    : USUAL_SOURCES.fromJohannesburg;
}

/**
 * Hubs send to their own branches and to other hubs.
 * A branch never receives from a hub that is not its supply hub,
 * so Harare cannot send to Cape Town.
 */
export function allowedTransferDestinations(from, locations) {
  if (!from || from.isSystem || !from.isHub) return [];
  const fromId = String(from.id);
  return (locations ?? []).filter((loc) => {
    if (!loc || loc.isSystem) return false;
    if (String(loc.id) === fromId) return false;
    if (loc.isHub) return true;
    return String(loc.supplyHubId ?? "") === fromId;
  });
}

export function isTransferAllowed(from, to, locations) {
  if (!from || !to) return false;
  return allowedTransferDestinations(from, locations).some(
    (loc) => String(loc.id) === String(to.id),
  );
}

/**
 * One catalog price per currency. USD shops use retailPriceCents and the
 * dollar pack prices. Every ZAR shop uses zarRetailPriceCents and the rand
 * pack prices, so Johannesburg and Cape Town share the same numbers.
 */
export function priceForLocation({ product, category, location }) {
  const currency = normalizeCurrency(location?.currency);
  if (currency === DEFAULT_CURRENCY) {
    return { ok: true, currency, product, category };
  }
  if (currency !== "ZAR" || product?.zarRetailPriceCents == null) {
    return { ok: false, currency, reason: "No price in this currency." };
  }

  const nextProduct = {
    ...product,
    retailPriceCents: product.zarRetailPriceCents,
  };
  if (!category) return { ok: true, currency, product: nextProduct, category: null };

  const needsRetailPack = Number(category.retailPackQty) > 0;
  const needsWholesalePack = Number(category.wholesalePackQty) > 0;
  if (needsRetailPack && category.zarRetailPackPriceCents == null) {
    return { ok: false, currency, reason: "No retail pack price in this currency." };
  }
  if (needsWholesalePack && category.zarWholesalePackPriceCents == null) {
    return { ok: false, currency, reason: "No wholesale pack price in this currency." };
  }

  return {
    ok: true,
    currency,
    product: nextProduct,
    category: {
      ...category,
      retailPackPriceCents: needsRetailPack
        ? category.zarRetailPackPriceCents
        : (category.retailPackPriceCents ?? 0),
      wholesalePackPriceCents: needsWholesalePack
        ? category.zarWholesalePackPriceCents
        : (category.wholesalePackPriceCents ?? 0),
    },
  };
}

/**
 * Shop-wide money stays inside one currency. Missing currency is USD.
 */
export function sameCurrency(rows, currency = DEFAULT_CURRENCY) {
  const code = normalizeCurrency(currency);
  return (rows ?? []).filter((row) => normalizeCurrency(row?.currency) === code);
}

export function sumCents(rows, field = "totalCents") {
  return (rows ?? []).reduce((sum, row) => sum + (Number(row?.[field]) || 0), 0);
}

/**
 * Harare inbound units, kept apart: salts produced locally vs goods that
 * arrived on a completed transfer from Johannesburg vs a local receive of a
 * product that usually comes from Johannesburg.
 */
export function harareInboundTotals({
  receives = [],
  transfers = [],
  harareId,
  johannesburgId,
}) {
  const rows = new Map();
  const ensure = (productId, productName) => {
    const id = String(productId ?? "");
    if (!rows.has(id)) {
      rows.set(id, {
        productId: id,
        productName: productName || "—",
        produced: 0,
        fromJohannesburg: 0,
        localException: 0,
      });
    }
    return rows.get(id);
  };

  for (const movement of receives) {
    if (String(movement.locationId ?? "") !== String(harareId)) continue;
    if (movement.type && movement.type !== "receive") continue;
    const row = ensure(movement.productId, movement.productName);
    const qty = Math.abs(Number(movement.quantityDelta ?? movement.quantity) || 0);
    if (movement.sourceKind === SOURCE_KIND.produced) row.produced += qty;
    else row.localException += qty;
  }

  for (const transfer of transfers) {
    if (String(transfer.toLocationId ?? "") !== String(harareId)) continue;
    if (String(transfer.fromLocationId ?? "") !== String(johannesburgId)) continue;
    if (transfer.status && transfer.status !== "completed") continue;
    const row = ensure(transfer.productId, transfer.productName);
    row.fromJohannesburg += Math.abs(Number(transfer.quantity) || 0);
  }

  return [...rows.values()].filter(
    (row) => row.produced || row.fromJohannesburg || row.localException,
  );
}
