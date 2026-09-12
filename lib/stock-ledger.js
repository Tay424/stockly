/** Sale lifecycle for Phase 1b voids. Legacy rows without status act as recorded. */
export const SALE_STATUS = {
  recorded: "recorded",
  voidRequested: "void_requested",
  voided: "voided",
};

export const MOVEMENT_TYPE = {
  sale: "sale",
  void: "void",
  adminAdjust: "admin_adjust",
  /** Replenishment from Inventory — positive quantityDelta, dated. */
  receive: "receive",
};

/** Default when product.lowStockThreshold is missing. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 5;

export function startOfLocalDay(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Local Monday 00:00 for the week containing `now` (Sun=0 … Sat=6). */
export function startOfLocalWeek(now = new Date()) {
  const d = startOfLocalDay(now);
  const day = d.getDay();
  d.setDate(d.getDate() - ((day + 6) % 7));
  return d;
}

export function endOfLocalDay(now = new Date()) {
  const d = startOfLocalDay(now);
  d.setDate(d.getDate() + 1);
  return d;
}

export function isSameLocalDay(a, b = new Date()) {
  if (!a) return false;
  return startOfLocalDay(a).getTime() === startOfLocalDay(b).getTime();
}

/** Normalize missing/legacy status to recorded. */
export function effectiveSaleStatus(sale) {
  return sale?.status || SALE_STATUS.recorded;
}

export function isActiveSaleStatus(status) {
  return status === SALE_STATUS.recorded || status === SALE_STATUS.voidRequested;
}

function inWindow(isoOrDate, start, end) {
  if (!isoOrDate || !start || !end) return false;
  const t = new Date(isoOrDate).getTime();
  return t >= start.getTime() && t < end.getTime();
}

/**
 * Compare sales and stock movements for one window.
 *
 * `sales` should include every sale created in the window, plus any sale
 * referenced by a movement in the window (e.g. an older sale voided today).
 * `movements` are all ledger rows created in the window.
 */
export function findDiscrepancies(sales, movements, window = {}) {
  const { start = null, end = null } = window;
  const discrepancies = [];
  const byProduct = new Map();
  const salesById = new Map(sales.map((s) => [s.id, s]));

  const touch = (productId, productName) => {
    const key = productId ?? `name:${productName ?? "—"}`;
    if (!byProduct.has(key)) {
      byProduct.set(key, {
        key,
        productId: productId ?? null,
        productName: productName ?? "—",
        soldUnits: 0,
        voidedUnits: 0,
        saleMovementUnits: 0,
        voidMovementUnits: 0,
        adjustUnits: 0,
      });
    }
    return byProduct.get(key);
  };

  for (const sale of sales) {
    const status = effectiveSaleStatus(sale);
    const createdInWindow = !start || inWindow(sale.createdAt, start, end);
    const voidedInWindow =
      status === SALE_STATUS.voided && (!start || inWindow(sale.voidedAt, start, end));

    const lines =
      Array.isArray(sale.lines) && sale.lines.length > 0
        ? sale.lines
        : [
            {
              productId: sale.productId ?? null,
              productName: sale.productName ?? "—",
              quantity: sale.quantity ?? 0,
            },
          ];

    for (const line of lines) {
      const row = touch(line.productId ?? null, line.productName ?? sale.productName);
      if (createdInWindow && status !== SALE_STATUS.voided) {
        row.soldUnits += line.quantity ?? 0;
      }
      if (createdInWindow && status === SALE_STATUS.voided) {
        row.soldUnits += line.quantity ?? 0;
        row.voidedUnits += line.quantity ?? 0;
      } else if (voidedInWindow) {
        row.voidedUnits += line.quantity ?? 0;
      }
    }

    const saleMoves = movements.filter(
      (m) => m.type === MOVEMENT_TYPE.sale && m.refId === sale.id,
    );
    const voidMoves = movements.filter(
      (m) => m.type === MOVEMENT_TYPE.void && m.refId === sale.id,
    );

    if (createdInWindow) {
      if (saleMoves.length === 0) {
        discrepancies.push({
          kind: "sale_missing_movement",
          message: `Sale of ${sale.productName ?? "product"} ×${sale.quantity} has no matching stock movement.`,
          productId: sale.productId ?? null,
          productName: sale.productName ?? "—",
          saleId: sale.id,
          expected: -(sale.quantity ?? 0),
          actual: 0,
        });
      } else {
        const delta = saleMoves.reduce((sum, m) => sum + (m.quantityDelta ?? 0), 0);
        if (delta !== -(sale.quantity ?? 0)) {
          discrepancies.push({
            kind: "sale_qty_mismatch",
            message: `Sale movement qty for ${sale.productName ?? "product"} does not match the sale.`,
            productId: sale.productId ?? null,
            productName: sale.productName ?? "—",
            saleId: sale.id,
            expected: -(sale.quantity ?? 0),
            actual: delta,
          });
        }
      }
    }

    if (status === SALE_STATUS.voided && voidedInWindow && voidMoves.length === 0) {
      discrepancies.push({
        kind: "void_missing_movement",
        message: `Voided sale of ${sale.productName ?? "product"} has no void stock movement.`,
        productId: sale.productId ?? null,
        productName: sale.productName ?? "—",
        saleId: sale.id,
        expected: sale.quantity ?? 0,
        actual: 0,
      });
    }
  }

  for (const movement of movements) {
    const row = touch(movement.productId, movement.productName);
    if (movement.type === MOVEMENT_TYPE.sale) {
      row.saleMovementUnits += Math.abs(movement.quantityDelta ?? 0);
      if (movement.refId && !salesById.has(movement.refId)) {
        discrepancies.push({
          kind: "movement_orphan_sale",
          message: `Sale movement for ${movement.productName ?? "product"} has no matching sale.`,
          productId: movement.productId ?? null,
          productName: movement.productName ?? "—",
          movementId: movement.id,
          saleId: movement.refId,
          expected: null,
          actual: movement.quantityDelta ?? 0,
        });
      }
    } else if (movement.type === MOVEMENT_TYPE.void) {
      row.voidMovementUnits += movement.quantityDelta ?? 0;
      if (movement.refId && !salesById.has(movement.refId)) {
        discrepancies.push({
          kind: "movement_orphan_void",
          message: `Void movement for ${movement.productName ?? "product"} has no matching sale.`,
          productId: movement.productId ?? null,
          productName: movement.productName ?? "—",
          movementId: movement.id,
          saleId: movement.refId,
          expected: null,
          actual: movement.quantityDelta ?? 0,
        });
      }
    } else if (movement.type === MOVEMENT_TYPE.adminAdjust) {
      row.adjustUnits += movement.quantityDelta ?? 0;
    } else if (movement.type === MOVEMENT_TYPE.receive) {
      // Receives are intentional replenishment — not sale/void discrepancies.
      row.receiveUnits = (row.receiveUnits ?? 0) + (movement.quantityDelta ?? 0);
    }
  }

  const products = [...byProduct.values()].map((row) => {
    const ok =
      row.soldUnits === row.saleMovementUnits && row.voidedUnits === row.voidMovementUnits;
    if (!ok) {
      const already = discrepancies.some(
        (d) =>
          (d.productId && d.productId === row.productId) ||
          (!d.productId && d.productName === row.productName),
      );
      if (!already) {
        discrepancies.push({
          kind: "product_totals_mismatch",
          message: `${row.productName}: sold ${row.soldUnits} / ledger ${row.saleMovementUnits}; voided ${row.voidedUnits} / ledger ${row.voidMovementUnits}.`,
          productId: row.productId,
          productName: row.productName,
          expected: row.soldUnits,
          actual: row.saleMovementUnits,
        });
      }
    }
    return { ...row, ok };
  });

  return { products, discrepancies };
}
