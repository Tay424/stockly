import "server-only";

import { db } from "./db.js";
import { EXPENSE_STATUS } from "./expense-constants.js";
import {
  ensureLocationsMigrated,
  listSellableLocations,
  toObjectId,
} from "./locations.js";
import { endOfLocalDay, startOfLocalDay } from "./stock-ledger.js";

const sales = () => db.collection("sale");
const expenses = () => db.collection("expense");

const APPROVED_EXPENSE = {
  $or: [{ status: EXPENSE_STATUS.approved }, { status: { $exists: false } }, { status: null }],
};

const NOT_VOIDED = {
  $or: [{ status: { $ne: "voided" } }, { status: { $exists: false } }, { status: null }],
};

/**
 * Per-branch sales / approved expenses / net for a time window.
 * Used on the admin dashboard for Harare vs Gweru accountability.
 */
export async function branchPerformanceSnapshot({
  from = startOfLocalDay(),
  to = endOfLocalDay(),
} = {}) {
  await ensureLocationsMigrated();
  const branches = await listSellableLocations();

  const saleMatch = {
    ...NOT_VOIDED,
    createdAt: { $gte: from, $lt: to },
  };
  const expenseMatch = {
    ...APPROVED_EXPENSE,
    spentAt: { $gte: from, $lt: to },
  };

  const [saleRows, expenseRows] = await Promise.all([
    sales()
      .aggregate([
        { $match: saleMatch },
        {
          $group: {
            _id: "$locationId",
            locationName: { $first: "$locationName" },
            revenueCents: { $sum: "$totalCents" },
            saleCount: { $sum: 1 },
            unitsSold: { $sum: "$quantity" },
          },
        },
      ])
      .toArray(),
    expenses()
      .aggregate([
        { $match: expenseMatch },
        {
          $group: {
            _id: "$locationId",
            locationName: { $first: "$locationName" },
            expenseCents: { $sum: "$amountCents" },
            expenseCount: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const salesById = new Map(
    saleRows.map((row) => [row._id ? String(row._id) : "", row]),
  );
  const expensesById = new Map(
    expenseRows.map((row) => [row._id ? String(row._id) : "", row]),
  );

  const byLocation = branches.map((branch) => {
    const sale = salesById.get(branch.id) ?? {};
    const expense = expensesById.get(branch.id) ?? {};
    const revenueCents = sale.revenueCents ?? 0;
    const expenseCents = expense.expenseCents ?? 0;
    return {
      locationId: branch.id,
      locationName: branch.name,
      isHub: Boolean(branch.isHub),
      revenueCents,
      saleCount: sale.saleCount ?? 0,
      unitsSold: sale.unitsSold ?? 0,
      expenseCents,
      expenseCount: expense.expenseCount ?? 0,
      netCents: revenueCents - expenseCents,
    };
  });

  const totals = byLocation.reduce(
    (acc, row) => {
      acc.revenueCents += row.revenueCents;
      acc.saleCount += row.saleCount;
      acc.unitsSold += row.unitsSold;
      acc.expenseCents += row.expenseCents;
      acc.expenseCount += row.expenseCount;
      acc.netCents += row.netCents;
      return acc;
    },
    {
      revenueCents: 0,
      saleCount: 0,
      unitsSold: 0,
      expenseCents: 0,
      expenseCount: 0,
      netCents: 0,
    },
  );

  return {
    from: from.toISOString(),
    to: to.toISOString(),
    byLocation,
    totals,
  };
}

export async function branchPerformanceToday(now = new Date()) {
  return branchPerformanceSnapshot({
    from: startOfLocalDay(now),
    to: endOfLocalDay(now),
  });
}

export async function branchPerformanceMonth(now = new Date()) {
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return branchPerformanceSnapshot({ from, to });
}

/** Optional location filter for expense lists. */
export function expenseLocationFilter(locationId) {
  if (!locationId) return {};
  const lid = toObjectId(locationId);
  if (!lid) return { locationId: String(locationId) };
  return { locationId: lid };
}
