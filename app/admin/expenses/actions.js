"use server";

import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { EXPENSE_STATUS } from "@/lib/expense-constants";
import {
  approveExpense,
  assertExpenseFields,
  createExpense,
  deleteExpense,
  findExpenseById,
  listExpenses,
  listPendingExpenses,
  requestExpenseChanges,
  updateExpenseApplication,
} from "@/lib/finance";
import { notifyExpenseStatus } from "@/lib/notify";
import { parseMoneyToCents } from "@/lib/pricing";
import { storeReceiptFile } from "@/lib/receipts";
import { requireAdmin } from "@/lib/session";

function revalidateExpensePaths() {
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/dashboard");
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
}

function readCoreForm(formData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountCents = parseMoneyToCents(formData.get("amount"));
  const rawDate = String(formData.get("spentAt") ?? "").trim();
  const spentAt = rawDate ? new Date(rawDate) : new Date();
  return assertExpenseFields({ name, category, description, amountCents, spentAt });
}

export async function fetchExpensesAction() {
  await requireAdmin();
  return listExpenses();
}

export async function fetchPendingExpensesAction() {
  await requireAdmin();
  return listPendingExpenses();
}

/** Admin direct expense — auto-approved; receipt optional. */
export async function saveAdminExpenseAction(id, formData) {
  const { user } = await requireAdmin();
  const { error, fields } = readCoreForm(formData);
  if (error) return { error };

  const file = formData.get("receipt");
  let receipt = null;
  if (file && typeof file === "object" && "arrayBuffer" in file && file.size > 0) {
    const stored = await storeReceiptFile(file);
    if (!stored.ok) return { error: stored.reason };
    receipt = stored.receipt;
  }

  if (id) {
    const existing = await findExpenseById(id);
    if (!existing) return { error: "Expense not found." };
    if (existing.status !== EXPENSE_STATUS.approved) {
      return { error: "Use Approve / Request changes for applications." };
    }
    const patch = { ...fields };
    if (receipt) {
      patch.receiptUrl = receipt.url;
      patch.receiptKey = receipt.key;
      patch.receiptMime = receipt.mime;
      patch.receiptName = receipt.name;
    }
    const result = await updateExpenseApplication(id, patch, {
      allowStatuses: [EXPENSE_STATUS.approved],
    });
    if (!result.ok) return { error: result.reason };
  } else {
    await createExpense({
      ...fields,
      status: EXPENSE_STATUS.approved,
      recordedBy: user.id,
      recordedByName: user.name,
      reviewedBy: user.id,
      reviewedByName: user.name,
      ...(receipt
        ? {
            receiptUrl: receipt.url,
            receiptKey: receipt.key,
            receiptMime: receipt.mime,
            receiptName: receipt.name,
          }
        : {}),
    });
  }

  revalidateExpensePaths();
  return {};
}

export async function deleteExpenseAction(id) {
  await requireAdmin();
  const result = await deleteExpense(id);
  if (!result.ok) return { error: result.reason };
  revalidateExpensePaths();
  return {};
}

export async function approveExpenseAction(id) {
  const { user } = await requireAdmin();
  const result = await approveExpense(id, { adminId: user.id, adminName: user.name });
  if (!result.ok) return { error: result.reason };

  const applicantEmail = await lookupUserEmail(result.expense?.recordedBy);
  await notifyExpenseStatus({
    expense: result.expense,
    toEmail: applicantEmail,
    kind: "approved",
  });

  revalidateExpensePaths();
  return {};
}

export async function requestExpenseChangesAction(id, reason) {
  const { user } = await requireAdmin();
  const result = await requestExpenseChanges(id, {
    adminId: user.id,
    adminName: user.name,
    reason,
  });
  if (!result.ok) return { error: result.reason };

  const applicantEmail = await lookupUserEmail(result.expense?.recordedBy);
  await notifyExpenseStatus({
    expense: result.expense,
    toEmail: applicantEmail,
    kind: "changes_requested",
  });

  revalidateExpensePaths();
  return {};
}

async function lookupUserEmail(userId) {
  if (!userId) return null;
  try {
    const ctx = await auth.$context;
    const user = await ctx.internalAdapter.findUserById(userId);
    return user?.email ?? null;
  } catch {
    return null;
  }
}
