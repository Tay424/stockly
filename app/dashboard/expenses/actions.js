"use server";

import { revalidatePath } from "next/cache";

import { EXPENSE_STATUS } from "@/lib/expense-constants";
import {
  assertExpenseFields,
  createExpense,
  deleteExpense,
  findExpenseById,
  listExpensesBy,
  updateExpenseApplication,
} from "@/lib/finance";
import { parseMoneyToCents } from "@/lib/pricing";
import { storeReceiptFile } from "@/lib/receipts";
import { requireUser } from "@/lib/session";

function revalidateMine() {
  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
  revalidatePath("/admin/expenses");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/dashboard");
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

export async function fetchMyExpensesAction() {
  const { user } = await requireUser();
  return listExpensesBy(user.id);
}

/** Attendant apply (pending) or resubmit after changes_requested. Receipt required on create. */
export async function saveMyExpenseAction(id, formData) {
  const { user } = await requireUser();
  const { error, fields } = readCoreForm(formData);
  if (error) return { error };

  const file = formData.get("receipt");
  const hasNewFile =
    file && typeof file === "object" && "arrayBuffer" in file && Number(file.size) > 0;

  if (id) {
    const existing = await findExpenseById(id);
    if (!existing || existing.recordedBy !== user.id) {
      return { error: "Expense not found." };
    }
    if (existing.status !== EXPENSE_STATUS.changesRequested) {
      return { error: "You can only edit expenses that were sent back for changes." };
    }

    let receiptPatch = {};
    if (hasNewFile) {
      const stored = await storeReceiptFile(file);
      if (!stored.ok) return { error: stored.reason };
      receiptPatch = {
        receiptUrl: stored.receipt.url,
        receiptKey: stored.receipt.key,
        receiptMime: stored.receipt.mime,
        receiptName: stored.receipt.name,
      };
    } else if (!existing.receiptUrl) {
      return { error: "A receipt image is required." };
    }

    const result = await updateExpenseApplication(
      id,
      { ...fields, ...receiptPatch },
      {
        ownerId: user.id,
        allowStatuses: [EXPENSE_STATUS.changesRequested],
      },
    );
    if (!result.ok) return { error: result.reason };
  } else {
    if (!hasNewFile) return { error: "A receipt image is required." };
    const stored = await storeReceiptFile(file);
    if (!stored.ok) return { error: stored.reason };

    await createExpense({
      ...fields,
      status: EXPENSE_STATUS.pending,
      recordedBy: user.id,
      recordedByName: user.name,
      receiptUrl: stored.receipt.url,
      receiptKey: stored.receipt.key,
      receiptMime: stored.receipt.mime,
      receiptName: stored.receipt.name,
    });
  }

  revalidateMine();
  return {};
}

export async function deleteMyExpenseAction(id) {
  const { user } = await requireUser();
  const result = await deleteExpense(id, user.id);
  if (!result.ok) return { error: result.reason };
  revalidateMine();
  return {};
}
