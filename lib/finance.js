import "server-only";

import { db } from "./db.js";
import { toObjectId } from "./catalog.js";

const expenses = () => db.collection("expense");
const sales = () => db.collection("sale");
const products = () => db.collection("product");

/** Months are keyed in UTC as "YYYY-MM" so sales and expenses always line up. */
const MONTH_KEY = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
const EXPENSE_MONTH_KEY = { $dateToString: { format: "%Y-%m", date: "$spentAt" } };

export function currentMonthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

const serializeExpense = ({ _id, ...rest }) => ({
  id: String(_id),
  ...rest,
  spentAt: rest.spentAt?.toISOString() ?? null,
});

export async function listExpenses() {
  const rows = await expenses().find({}).sort({ spentAt: -1 }).toArray();
  return rows.map(serializeExpense);
}

/** A seller only ever sees the expenses they recorded themselves. */
export async function listExpensesBy(userId) {
  const rows = await expenses().find({ recordedBy: userId }).sort({ spentAt: -1 }).toArray();
  return rows.map(serializeExpense);
}

export async function createExpense({
  name,
  description,
  amountCents,
  spentAt,
  recordedBy,
  recordedByName,
}) {
  const now = new Date();
  await expenses().insertOne({
    name,
    description,
    amountCents,
    spentAt: spentAt ?? now,
    recordedBy,
    recordedByName,
    createdAt: now,
    updatedAt: now,
  });
}

/**
 * `ownerId` scopes the write to one seller's own rows — pass it for sellers,
 * omit it for admins, who can edit anything.
 */
export async function updateExpense(id, { name, description, amountCents, spentAt }, ownerId) {
  const _id = toObjectId(id);
  if (!_id) return false;
  const filter = ownerId ? { _id, recordedBy: ownerId } : { _id };
  const res = await expenses().updateOne(
    filter,
    { $set: { name, description, amountCents, spentAt, updatedAt: new Date() } },
  );
  return res.matchedCount === 1;
}

export async function deleteExpense(id, ownerId) {
  const _id = toObjectId(id);
  if (!_id) return false;
  const filter = ownerId ? { _id, recordedBy: ownerId } : { _id };
  const res = await expenses().deleteOne(filter);
  return res.deletedCount === 1;
}

/**
 * Revenue, expenses and profit per calendar month, newest first.
 *
 * ponytail: profit here is revenue minus expenses. Products have no cost
 * price, so this is not gross margin — add a costPriceCents field if you need
 * cost of goods taken out too.
 */
export async function monthlyAccounts() {
  const [revenueRows, expenseRows] = await Promise.all([
    sales()
      .aggregate([
        {
          $group: {
            _id: MONTH_KEY,
            revenueCents: { $sum: "$totalCents" },
            saleCount: { $sum: 1 },
            unitsSold: { $sum: "$quantity" },
          },
        },
      ])
      .toArray(),
    expenses()
      .aggregate([
        {
          $group: {
            _id: EXPENSE_MONTH_KEY,
            expensesCents: { $sum: "$amountCents" },
            expenseCount: { $sum: 1 },
          },
        },
      ])
      .toArray(),
  ]);

  const months = new Map();
  const rowFor = (month) => {
    if (!months.has(month)) {
      months.set(month, {
        month,
        revenueCents: 0,
        expensesCents: 0,
        saleCount: 0,
        unitsSold: 0,
        expenseCount: 0,
      });
    }
    return months.get(month);
  };

  for (const r of revenueRows) {
    Object.assign(rowFor(r._id), {
      revenueCents: r.revenueCents,
      saleCount: r.saleCount,
      unitsSold: r.unitsSold,
    });
  }
  for (const e of expenseRows) {
    Object.assign(rowFor(e._id), {
      expensesCents: e.expensesCents,
      expenseCount: e.expenseCount,
    });
  }

  return [...months.values()]
    .map((row) => ({ ...row, profitCents: row.revenueCents - row.expensesCents }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export async function adminStats(now = new Date()) {
  const month = currentMonthKey(now);
  const accounts = await monthlyAccounts();
  const thisMonth = accounts.find((row) => row.month === month) ?? {
    month,
    revenueCents: 0,
    expensesCents: 0,
    profitCents: 0,
    saleCount: 0,
    unitsSold: 0,
    expenseCount: 0,
  };

  const [productCount, outOfStock, lowStock, topProducts] = await Promise.all([
    products().countDocuments({}),
    products().countDocuments({ stock: { $lte: 0 } }),
    products().countDocuments({ stock: { $gt: 0, $lte: 5 } }),
    sales()
      .aggregate([
        {
          $group: {
            _id: "$productName",
            unitsSold: { $sum: "$quantity" },
            revenueCents: { $sum: "$totalCents" },
          },
        },
        { $sort: { revenueCents: -1 } },
        { $limit: 5 },
      ])
      .toArray(),
  ]);

  return {
    month,
    thisMonth,
    months: accounts.slice(0, 6),
    productCount,
    outOfStock,
    lowStock,
    topProducts: topProducts.map((p) => ({
      name: p._id ?? "—",
      unitsSold: p.unitsSold,
      revenueCents: p.revenueCents,
    })),
  };
}

/** What one seller has done — they never see shop-wide expenses or profit. */
export async function sellerStats(userId, now = new Date()) {
  const startOfDay = new Date(now);
  startOfDay.setHours(0, 0, 0, 0);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [today, month, allTime, spentRow] = await Promise.all([
    sumSales({ soldBy: userId, createdAt: { $gte: startOfDay } }),
    sumSales({ soldBy: userId, createdAt: { $gte: monthStart } }),
    sumSales({ soldBy: userId }),
    expenses()
      .aggregate([
        { $match: { recordedBy: userId, spentAt: { $gte: monthStart } } },
        { $group: { _id: null, amountCents: { $sum: "$amountCents" }, count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);

  return {
    today,
    month,
    allTime,
    expensesThisMonth: {
      amountCents: spentRow[0]?.amountCents ?? 0,
      count: spentRow[0]?.count ?? 0,
    },
  };
}

async function sumSales(match) {
  const [row] = await sales()
    .aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          revenueCents: { $sum: "$totalCents" },
          saleCount: { $sum: 1 },
          unitsSold: { $sum: "$quantity" },
        },
      },
    ])
    .toArray();

  return {
    revenueCents: row?.revenueCents ?? 0,
    saleCount: row?.saleCount ?? 0,
    unitsSold: row?.unitsSold ?? 0,
  };
}
