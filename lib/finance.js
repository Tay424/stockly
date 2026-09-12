import "server-only";

import { db } from "./db.js";
import { toObjectId } from "./catalog.js";
import {
  bucketSalesByHour,
  groupSalesByAttendant,
  summarizeSales,
} from "./charts.js";
import {
  EXPENSE_STATUS,
  effectiveExpenseStatus,
  isValidCategory,
} from "./expense-constants.js";
import { endOfLocalDay, startOfLocalDay } from "./stock-ledger.js";
import { listInventoryHealth } from "./inventory.js";

const expenses = () => db.collection("expense");
const sales = () => db.collection("sale");
const products = () => db.collection("product");

/** Months are keyed in UTC as "YYYY-MM" so sales and expenses always line up. */
const MONTH_KEY = { $dateToString: { format: "%Y-%m", date: "$createdAt" } };
const EXPENSE_MONTH_KEY = { $dateToString: { format: "%Y-%m", date: "$spentAt" } };

/** Approved only — legacy missing status counts as approved via $or. */
const APPROVED_EXPENSE = {
  $or: [{ status: EXPENSE_STATUS.approved }, { status: { $exists: false } }, { status: null }],
};

export function currentMonthKey(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

const serializeExpense = ({ _id, ...rest }) => ({
  id: String(_id),
  ...rest,
  status: rest.status || EXPENSE_STATUS.approved,
  spentAt: rest.spentAt?.toISOString() ?? null,
  createdAt: rest.createdAt?.toISOString() ?? null,
  updatedAt: rest.updatedAt?.toISOString() ?? null,
  reviewedAt: rest.reviewedAt?.toISOString() ?? null,
  changesRequestedAt: rest.changesRequestedAt?.toISOString() ?? null,
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

export async function listPendingExpenses() {
  const rows = await expenses()
    .find({ status: EXPENSE_STATUS.pending })
    .sort({ createdAt: -1 })
    .toArray();
  return rows.map(serializeExpense);
}

export async function countPendingExpenses() {
  return expenses().countDocuments({ status: EXPENSE_STATUS.pending });
}

export async function countChangesRequestedFor(userId) {
  return expenses().countDocuments({
    recordedBy: userId,
    status: EXPENSE_STATUS.changesRequested,
  });
}

export async function findExpenseById(id) {
  const _id = toObjectId(id);
  if (!_id) return null;
  const row = await expenses().findOne({ _id });
  return row ? serializeExpense(row) : null;
}

/**
 * Admin direct log — auto-approved. Receipt optional.
 * Attendant apply — status pending; receipt required (enforced by caller).
 */
export async function createExpense(fields) {
  const now = new Date();
  const status = fields.status || EXPENSE_STATUS.approved;
  const doc = {
    name: fields.name,
    category: fields.category ?? null,
    description: fields.description ?? "",
    amountCents: fields.amountCents,
    spentAt: fields.spentAt ?? now,
    status,
    receiptUrl: fields.receiptUrl ?? null,
    receiptKey: fields.receiptKey ?? null,
    receiptMime: fields.receiptMime ?? null,
    receiptName: fields.receiptName ?? null,
    recordedBy: fields.recordedBy ?? null,
    recordedByName: fields.recordedByName ?? null,
    changesRequestedReason: null,
    changesRequestedAt: null,
    reviewedBy: status === EXPENSE_STATUS.approved ? (fields.reviewedBy ?? fields.recordedBy) : null,
    reviewedByName:
      status === EXPENSE_STATUS.approved
        ? (fields.reviewedByName ?? fields.recordedByName)
        : null,
    reviewedAt: status === EXPENSE_STATUS.approved ? now : null,
    createdAt: now,
    updatedAt: now,
  };
  const { insertedId } = await expenses().insertOne(doc);
  return serializeExpense({ _id: insertedId, ...doc });
}

/**
 * Attendant may only update when status is changes_requested (and owned).
 * Admin may update approved/direct rows freely via this helper for field edits.
 */
export async function updateExpenseApplication(id, fields, { ownerId, allowStatuses } = {}) {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, reason: "Expense not found." };

  const existing = await expenses().findOne({ _id });
  if (!existing) return { ok: false, reason: "Expense not found." };
  if (ownerId && existing.recordedBy !== ownerId) {
    return { ok: false, reason: "Expense not found." };
  }

  const status = effectiveExpenseStatus(existing);
  if (allowStatuses && !allowStatuses.includes(status)) {
    return { ok: false, reason: "This expense cannot be edited in its current status." };
  }

  const $set = {
    updatedAt: new Date(),
  };
  for (const key of [
    "name",
    "category",
    "description",
    "amountCents",
    "spentAt",
    "receiptUrl",
    "receiptKey",
    "receiptMime",
    "receiptName",
  ]) {
    if (fields[key] !== undefined) $set[key] = fields[key];
  }

  // Resubmit after changes requested → back to pending.
  if (status === EXPENSE_STATUS.changesRequested && ownerId) {
    $set.status = EXPENSE_STATUS.pending;
    $set.changesRequestedReason = null;
    $set.changesRequestedAt = null;
  }

  const res = await expenses().updateOne({ _id }, { $set });
  if (res.matchedCount !== 1) return { ok: false, reason: "Expense not found." };
  return { ok: true, expense: await findExpenseById(id) };
}

export async function approveExpense(id, { adminId, adminName }) {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, reason: "Expense not found." };
  const existing = await expenses().findOne({ _id });
  if (!existing) return { ok: false, reason: "Expense not found." };
  const status = effectiveExpenseStatus(existing);
  if (status === EXPENSE_STATUS.approved) {
    return { ok: false, reason: "That expense is already approved." };
  }
  if (status !== EXPENSE_STATUS.pending && status !== EXPENSE_STATUS.changesRequested) {
    return { ok: false, reason: "Only pending applications can be approved." };
  }

  const now = new Date();
  await expenses().updateOne(
    { _id },
    {
      $set: {
        status: EXPENSE_STATUS.approved,
        reviewedBy: adminId,
        reviewedByName: adminName,
        reviewedAt: now,
        changesRequestedReason: null,
        changesRequestedAt: null,
        updatedAt: now,
      },
    },
  );
  return { ok: true, expense: await findExpenseById(id) };
}

export async function requestExpenseChanges(id, { adminId, adminName, reason }) {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, reason: "Expense not found." };
  const trimmed = String(reason ?? "").trim();
  if (!trimmed) return { ok: false, reason: "A reason is required when requesting changes." };

  const existing = await expenses().findOne({ _id });
  if (!existing) return { ok: false, reason: "Expense not found." };
  if (effectiveExpenseStatus(existing) !== EXPENSE_STATUS.pending) {
    return { ok: false, reason: "Only pending applications can be sent back." };
  }

  const now = new Date();
  await expenses().updateOne(
    { _id },
    {
      $set: {
        status: EXPENSE_STATUS.changesRequested,
        changesRequestedReason: trimmed,
        changesRequestedAt: now,
        reviewedBy: adminId,
        reviewedByName: adminName,
        reviewedAt: now,
        updatedAt: now,
      },
    },
  );
  return { ok: true, expense: await findExpenseById(id) };
}

export async function deleteExpense(id, ownerId) {
  const _id = toObjectId(id);
  if (!_id) return { ok: false, reason: "Expense not found." };
  const existing = await expenses().findOne(ownerId ? { _id, recordedBy: ownerId } : { _id });
  if (!existing) return { ok: false, reason: "Expense not found." };

  const status = effectiveExpenseStatus(existing);
  if (ownerId) {
    // Attendants may only discard applications that were sent back.
    if (status !== EXPENSE_STATUS.changesRequested) {
      return { ok: false, reason: "You can only discard expenses that were sent back for changes." };
    }
  }

  await expenses().deleteOne({ _id });
  return { ok: true };
}

/** One-time: legacy expenses without status → approved. */
export async function migrateLegacyExpensesToApproved() {
  const res = await expenses().updateMany(
    { $or: [{ status: { $exists: false } }, { status: null }] },
    {
      $set: {
        status: EXPENSE_STATUS.approved,
        updatedAt: new Date(),
      },
    },
  );
  return { matched: res.matchedCount, modified: res.modifiedCount };
}

export function assertExpenseFields({ name, category, description, amountCents, spentAt }) {
  if (!name?.trim()) return { error: "Name is required." };
  if (!isValidCategory(category)) return { error: "Pick a category." };
  if (amountCents === null || amountCents === undefined) {
    return { error: "Amount must be a valid amount." };
  }
  if (amountCents === 0) return { error: "Amount must be more than zero." };
  if (!(spentAt instanceof Date) || Number.isNaN(spentAt.getTime())) {
    return { error: "Date must be valid." };
  }
  return {
    fields: {
      name: name.trim(),
      category,
      description: String(description ?? "").trim(),
      amountCents,
      spentAt,
    },
  };
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
        { $match: { status: { $ne: "voided" } } },
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
        { $match: APPROVED_EXPENSE },
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

  const [productCount, health, topProducts] = await Promise.all([
    products().countDocuments({}),
    listInventoryHealth(),
    sales()
      .aggregate([
        { $match: { status: { $ne: "voided" } } },
        {
          // Best sellers count retail lines only. Pack revenue stays on the
          // receipt total (shop stats) and is not attributed to a single SKU.
          // Legacy single-product sales (no packs/retailLines) keep full total.
          $project: {
            items: {
              $cond: [
                {
                  $gt: [{ $size: { $ifNull: ["$retailLines", []] } }, 0],
                },
                {
                  $map: {
                    input: "$retailLines",
                    as: "line",
                    in: {
                      name: "$$line.productName",
                      quantity: "$$line.quantity",
                      revenueCents: "$$line.lineTotalCents",
                    },
                  },
                },
                {
                  $cond: [
                    { $gt: [{ $size: { $ifNull: ["$packs", []] } }, 0] },
                    [],
                    [
                      {
                        name: "$productName",
                        quantity: "$quantity",
                        revenueCents: "$totalCents",
                      },
                    ],
                  ],
                },
              ],
            },
          },
        },
        { $unwind: { path: "$items", preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: "$items.name",
            unitsSold: { $sum: "$items.quantity" },
            revenueCents: { $sum: "$items.revenueCents" },
          },
        },
        { $sort: { revenueCents: -1 } },
        { $limit: 5 },
      ])
      .toArray(),
  ]);

  const outOfStock = health.counts.out;
  const lowStock = health.counts.low;

  return {
    month,
    thisMonth,
    months: accounts.slice(0, 6),
    productCount,
    outOfStock,
    lowStock,
    needsAttention: health.counts.needsAttention,
    topProducts: topProducts.map((p) => ({
      name: p._id ?? "—",
      unitsSold: p.unitsSold,
      revenueCents: p.revenueCents,
    })),
  };
}

/** What one seller has done — they never see shop-wide expenses or profit. */
export async function sellerStats(userId, now = new Date()) {
  const startOfDay = startOfLocalDay(now);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [today, month, allTime, spentRow] = await Promise.all([
    sumSales({ soldBy: userId, createdAt: { $gte: startOfDay } }),
    sumSales({ soldBy: userId, createdAt: { $gte: monthStart } }),
    sumSales({ soldBy: userId }),
    expenses()
      .aggregate([
        {
          $match: {
            recordedBy: userId,
            spentAt: { $gte: monthStart },
            ...APPROVED_EXPENSE,
          },
        },
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

/** Voided sales never count toward revenue or units. */
const NOT_VOIDED = { status: { $ne: "voided" } };

async function sumSales(match) {
  const [row] = await sales()
    .aggregate([
      { $match: { ...match, ...NOT_VOIDED } },
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

async function loadTodaySales(extraMatch = {}, now = new Date()) {
  const start = startOfLocalDay(now);
  const end = endOfLocalDay(now);
  const rows = await sales()
    .find({
      ...extraMatch,
      ...NOT_VOIDED,
      createdAt: { $gte: start, $lt: end },
    })
    .project({
      totalCents: 1,
      quantity: 1,
      createdAt: 1,
      soldBy: 1,
      soldByName: 1,
      productName: 1,
    })
    .toArray();

  return rows.map((row) => ({
    totalCents: row.totalCents ?? 0,
    quantity: row.quantity ?? 0,
    createdAt: row.createdAt?.toISOString?.() ?? row.createdAt,
    soldBy: row.soldBy != null ? String(row.soldBy) : null,
    soldByName: row.soldByName ?? null,
    productName: row.productName ?? null,
  }));
}

/** Attendant dashboard charts — my performance, Today-focused. */
export async function sellerChartData(userId, now = new Date()) {
  const todaySales = await loadTodaySales({ soldBy: userId }, now);
  return {
    periodLabel: "Today",
    totals: summarizeSales(todaySales),
    hourly: bucketSalesByHour(todaySales),
  };
}

/** Admin dashboard charts — shop totals today + per-attendant breakdown. */
export async function adminChartData(now = new Date()) {
  const todaySales = await loadTodaySales({}, now);
  return {
    periodLabel: "Today",
    totals: summarizeSales(todaySales),
    hourly: bucketSalesByHour(todaySales),
    attendants: groupSalesByAttendant(todaySales),
  };
}
