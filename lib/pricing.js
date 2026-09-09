// Money is stored as integer cents everywhere. Only format at the edges.
const CURRENCY = "USD";

const formatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: CURRENCY,
});

export function formatMoney(cents) {
  return formatter.format((cents ?? 0) / 100);
}

/** "12.50" -> 1250. Returns null when the input isn't a valid non-negative amount. */
export function parseMoneyToCents(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return null; // Number("") is 0 — a blank field must not become $0.00
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100);
}

export function isWholesale(product, quantity) {
  const min = product.wholesaleMinQty ?? 0;
  return min > 0 && quantity >= min;
}

/** The tier price before any discount. */
export function basePriceFor(product, quantity) {
  return isWholesale(product, quantity)
    ? product.wholesalePriceCents
    : product.retailPriceCents;
}

const timeOf = (value) => {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t; // an unparseable date must not open the window
};

/**
 * A discount runs from `discountStartsAt` up to (but not including)
 * `discountEndsAt`. A missing end date means it runs indefinitely.
 */
export function isDiscountActive(product, now = new Date()) {
  if (!(product.discountPercent > 0)) return false;

  const t = now.getTime();
  const start = timeOf(product.discountStartsAt);
  const end = timeOf(product.discountEndsAt);

  if (start !== null && t < start) return false;
  if (end !== null && t >= end) return false;
  return true;
}

/** "none" | "scheduled" | "active" | "expired" — for badges in the admin table. */
export function discountStatus(product, now = new Date()) {
  if (!(product.discountPercent > 0)) return "none";
  if (isDiscountActive(product, now)) return "active";

  const start = timeOf(product.discountStartsAt);
  if (start !== null && now.getTime() < start) return "scheduled";
  return "expired";
}

export function applyDiscount(cents, percent) {
  return Math.round(cents * (1 - percent / 100));
}

/**
 * The price tier: buy fewer than `wholesaleMinQty` and you pay retail, hit that
 * quantity or more and every unit drops to the wholesale price. A
 * wholesaleMinQty of 0 means the product never tiers down. An active discount
 * then comes off whichever tier price applies.
 */
export function unitPriceFor(product, quantity, now = new Date()) {
  const base = basePriceFor(product, quantity);
  return isDiscountActive(product, now)
    ? applyDiscount(base, product.discountPercent)
    : base;
}

export function lineTotal(product, quantity, now = new Date()) {
  return unitPriceFor(product, quantity, now) * quantity;
}

function asMap(maybeMap) {
  if (maybeMap instanceof Map) return maybeMap;
  return new Map(Object.entries(maybeMap ?? {}));
}

/**
 * Price a multi-line Sales receipt using category wholesale packs.
 *
 * For each category: packs = floor(qty / packQty) at packPriceCents (ignoring
 * product prices). Leftover units are full retail — no % discounts. Pack units
 * are filled by productId ascending within the category.
 *
 * `cartLines`: [{ productId, quantity }]
 * `productsById` / `categoriesById`: Map or plain object keyed by id string.
 */
export function priceReceipt(cartLines, productsById, categoriesById) {
  const products = asMap(productsById);
  const categories = asMap(categoriesById);

  const merged = new Map();
  for (const line of cartLines ?? []) {
    const id = String(line?.productId ?? "").trim();
    const qty = Number(line?.quantity);
    if (!id || !Number.isInteger(qty) || qty < 1) continue;
    merged.set(id, (merged.get(id) ?? 0) + qty);
  }

  const byCategory = new Map();
  for (const [productId, quantity] of merged) {
    const product = products.get(productId);
    if (!product) {
      return { ok: false, reason: `Product ${productId} was not found.` };
    }
    const categoryId = product.categoryId ? String(product.categoryId) : "";
    if (!categoryId) {
      return {
        ok: false,
        reason: `${product.name ?? "A product"} has no category and cannot be sold.`,
      };
    }
    if (!byCategory.has(categoryId)) byCategory.set(categoryId, []);
    byCategory.get(categoryId).push({ productId, product, quantity });
  }

  if (byCategory.size === 0) {
    return { ok: false, reason: "Add at least one product to the receipt." };
  }

  const packs = [];
  const retailLines = [];
  const stockLines = [];
  let totalCents = 0;
  let quantity = 0;

  // Stable category order for deterministic receipt layout.
  const categoryIds = [...byCategory.keys()].sort();

  for (const categoryId of categoryIds) {
    const items = byCategory.get(categoryId);
    items.sort((a, b) => a.productId.localeCompare(b.productId));

    const category = categories.get(categoryId) ?? {};
    const categoryName = category.name ?? "Category";
    const packQty = Number(category.wholesalePackQty) || 0;
    const packPriceCents = Number(category.wholesalePackPriceCents) || 0;
    const categoryQty = items.reduce((sum, item) => sum + item.quantity, 0);

    let packCount = 0;
    let packUnitsLeft = 0;
    if (packQty > 0) {
      packCount = Math.floor(categoryQty / packQty);
      packUnitsLeft = packCount * packQty;
    }

    const contributions = [];

    for (const item of items) {
      const intoPack = Math.min(item.quantity, packUnitsLeft);
      const retailQty = item.quantity - intoPack;
      packUnitsLeft -= intoPack;

      if (intoPack > 0) {
        contributions.push({
          productId: item.productId,
          productName: item.product.name,
          quantity: intoPack,
        });
      }

      const retailUnit = item.product.retailPriceCents ?? 0;
      const retailTotal = retailQty > 0 ? retailUnit * retailQty : 0;

      stockLines.push({
        productId: item.productId,
        productName: item.product.name,
        categoryId,
        categoryName,
        quantity: item.quantity,
        packUnits: intoPack,
        retailUnits: retailQty,
        unitPriceCents: retailQty > 0 ? retailUnit : null,
        lineTotalCents: retailTotal,
      });

      if (retailQty > 0) {
        retailLines.push({
          productId: item.productId,
          productName: item.product.name,
          categoryId,
          categoryName,
          quantity: retailQty,
          unitPriceCents: retailUnit,
          lineTotalCents: retailTotal,
        });
        totalCents += retailTotal;
      }

      quantity += item.quantity;
    }

    if (packCount > 0) {
      const packTotal = packCount * packPriceCents;
      packs.push({
        categoryId,
        categoryName,
        packCount,
        packQty,
        packPriceCents,
        totalCents: packTotal,
        contributions,
      });
      totalCents += packTotal;
    }
  }

  return {
    ok: true,
    packs,
    retailLines,
    stockLines,
    totalCents,
    quantity,
    wholesale: packs.length > 0,
  };
}

/** "Pink salt +2" summary for sales list Product column. */
export function saleProductSummary(stockLines) {
  if (!Array.isArray(stockLines) || stockLines.length === 0) return "—";
  const first = stockLines[0].productName ?? "Item";
  const extra = stockLines.length - 1;
  return extra > 0 ? `${first} +${extra}` : first;
}

/**
 * Expand a sale into per-product stock rows (receipt lines or legacy single product).
 */
export function saleStockLines(sale) {
  if (Array.isArray(sale?.lines) && sale.lines.length > 0) {
    return sale.lines.map((line) => ({
      productId: line.productId ? String(line.productId) : null,
      productName: line.productName ?? "—",
      quantity: line.quantity ?? 0,
    }));
  }
  return [
    {
      productId: sale?.productId ? String(sale.productId) : null,
      productName: sale?.productName ?? "—",
      quantity: sale?.quantity ?? 0,
    },
  ];
}
