"use server";

import { revalidatePath } from "next/cache";

import { createExpense, deleteExpense, listExpenses, updateExpense } from "@/lib/finance";
import { parseMoneyToCents } from "@/lib/pricing";
import { requireAdmin } from "@/lib/session";

export async function fetchExpensesAction() {
  await requireAdmin();
  return listExpenses();
}

function readForm(formData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const amountCents = parseMoneyToCents(formData.get("amount"));
  const rawDate = String(formData.get("spentAt") ?? "").trim();

  if (!name) return { error: "Name is required." };
  if (amountCents === null) return { error: "Amount must be a valid amount." };
  if (amountCents === 0) return { error: "Amount must be more than zero." };

  const spentAt = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(spentAt.getTime())) return { error: "Date must be valid." };

  return { fields: { name, description, amountCents, spentAt } };
}

export async function saveExpenseAction(id, formData) {
  await requireAdmin();

  const { error, fields } = readForm(formData);
  if (error) return { error };

  if (id) {
    const ok = await updateExpense(id, fields);
    if (!ok) return { error: "Expense not found." };
  } else {
    await createExpense(fields);
  }

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/dashboard");
  return {};
}

export async function deleteExpenseAction(id) {
  await requireAdmin();

  const ok = await deleteExpense(id);
  if (!ok) return { error: "Expense not found." };

  revalidatePath("/admin/expenses");
  revalidatePath("/admin/accounts");
  revalidatePath("/admin/dashboard");
  return {};
}
