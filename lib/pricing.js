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
