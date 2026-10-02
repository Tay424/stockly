/**
 * Pure helpers for month-scoped product performance (units from stock_month).
 * Not moving = sold 0 this month AND still has stock on hand.
 */

export function isNotMovingRow(row) {
  const sold = Number(row?.sold) || 0;
  const closing = Number(row?.closingStock) || 0;
  return sold === 0 && closing > 0;
}

/**
 * Enrich raw stock_month rows with category + notMoving flag.
 * `categoryByProductId`: Map or object keyed by productId string → categoryName.
 */
export function buildMonthPerformanceRows(rawRows, categoryByProductId = {}) {
  const lookup =
    categoryByProductId instanceof Map
      ? categoryByProductId
      : new Map(Object.entries(categoryByProductId ?? {}));

  return (rawRows ?? []).map((row) => {
    const productId = String(row.productId ?? "");
    const sold = Number(row.sold) || 0;
    const closingStock = Number(row.closingStock) || 0;
    const openingStock = Number(row.openingStock) || 0;
    const received = Number(row.received) || 0;
    const voided = Number(row.voided) || 0;
    const adjusted = Number(row.adjusted) || 0;
    const productName = row.productName ?? "—";
    const notMoving = sold === 0 && closingStock > 0;
    return {
      id: row.id ?? (row._id ? String(row._id) : productId),
      productId,
      productName,
      categoryName: lookup.get(productId) ?? row.categoryName ?? null,
      openingStock,
      received,
      sold,
      voided,
      adjusted,
      closingStock,
      notMoving,
    };
  });
}

export function monthPerformanceCounts(rows) {
  let notMovingCount = 0;
  let movedCount = 0;
  for (const row of rows ?? []) {
    if (row.notMoving) notMovingCount += 1;
    else if ((Number(row.sold) || 0) > 0) movedCount += 1;
  }
  return { notMovingCount, movedCount };
}

/** Top movers by sold desc, then product name. */
export function sortMonthMovers(rows, limit = 5) {
  const sorted = [...(rows ?? [])]
    .filter((row) => (Number(row.sold) || 0) > 0)
    .sort((a, b) => {
      const soldDiff = (Number(b.sold) || 0) - (Number(a.sold) || 0);
      if (soldDiff !== 0) return soldDiff;
      return String(a.productName ?? "").localeCompare(String(b.productName ?? ""));
    });
  return limit == null ? sorted : sorted.slice(0, limit);
}

/** Not-moving rows by closing stock desc, then name. */
export function sortNotMoving(rows, limit = null) {
  const sorted = [...(rows ?? [])]
    .filter((row) => row.notMoving)
    .sort((a, b) => {
      const stockDiff = (Number(b.closingStock) || 0) - (Number(a.closingStock) || 0);
      if (stockDiff !== 0) return stockDiff;
      return String(a.productName ?? "").localeCompare(String(b.productName ?? ""));
    });
  return limit == null ? sorted : sorted.slice(0, limit);
}

/** Default table sort: sold desc; when focusing not-moving, closing desc. */
export function sortPerformanceTable(rows, { focusNotMoving = false } = {}) {
  const list = [...(rows ?? [])];
  if (focusNotMoving) {
    return list.sort((a, b) => {
      const stockDiff = (Number(b.closingStock) || 0) - (Number(a.closingStock) || 0);
      if (stockDiff !== 0) return stockDiff;
      return String(a.productName ?? "").localeCompare(String(b.productName ?? ""));
    });
  }
  return list.sort((a, b) => {
    const soldDiff = (Number(b.sold) || 0) - (Number(a.sold) || 0);
    if (soldDiff !== 0) return soldDiff;
    return String(a.productName ?? "").localeCompare(String(b.productName ?? ""));
  });
}
