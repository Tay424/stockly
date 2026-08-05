/**
 * Pure helpers for dashboard charts (Phase 1c). Today-focused; no date-range UI.
 */

/** Build 24 local-hour buckets, then trim to a shop-day window that covers activity. */
export function bucketSalesByHour(sales, { dayStartHour = 6, dayEndHour = 21 } = {}) {
  const byHour = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: formatHourLabel(hour),
    shortLabel: String(hour),
    revenueCents: 0,
    unitsSold: 0,
    saleCount: 0,
  }));

  let first = null;
  let last = null;
  for (const sale of sales) {
    if (!sale?.createdAt) continue;
    const hour = new Date(sale.createdAt).getHours();
    byHour[hour].revenueCents += sale.totalCents ?? 0;
    byHour[hour].unitsSold += sale.quantity ?? 0;
    byHour[hour].saleCount += 1;
    first = first === null ? hour : Math.min(first, hour);
    last = last === null ? hour : Math.max(last, hour);
  }

  const start = first === null ? dayStartHour : Math.min(dayStartHour, first);
  const end = last === null ? dayEndHour : Math.max(dayEndHour, last);
  return byHour.slice(start, end + 1);
}

export function formatHourLabel(hour) {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? "am" : "pm";
  const twelve = h % 12 === 0 ? 12 : h % 12;
  return `${twelve}${suffix}`;
}

export function summarizeSales(sales) {
  return sales.reduce(
    (acc, sale) => {
      acc.revenueCents += sale.totalCents ?? 0;
      acc.unitsSold += sale.quantity ?? 0;
      acc.saleCount += 1;
      return acc;
    },
    { revenueCents: 0, unitsSold: 0, saleCount: 0 },
  );
}

/** Group sales by attendant for horizontal breakdown charts. */
export function groupSalesByAttendant(sales) {
  const map = new Map();
  for (const sale of sales) {
    const id = sale.soldBy ?? "unknown";
    if (!map.has(id)) {
      map.set(id, {
        soldBy: id,
        soldByName: sale.soldByName || "Unknown",
        revenueCents: 0,
        unitsSold: 0,
        saleCount: 0,
      });
    }
    const row = map.get(id);
    row.revenueCents += sale.totalCents ?? 0;
    row.unitsSold += sale.quantity ?? 0;
    row.saleCount += 1;
    if (sale.soldByName) row.soldByName = sale.soldByName;
  }
  return [...map.values()].sort((a, b) => b.revenueCents - a.revenueCents);
}
