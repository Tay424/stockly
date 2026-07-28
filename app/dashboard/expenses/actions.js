"use server";

import { revalidatePath } from "next/cache";

import { createExpense, deleteExpense, listExpensesBy, updateExpense } from "@/lib/finance";
import { parseMoneyToCents } from "@/lib/pricing";
import { requireUser } from "@/lib/session";

export async function fetchMyExpensesAction() {
  const { user } = await requireUser();
  return listExpensesBy(user.id);
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

export async function saveMyExpenseAction(id, formData) {
  const { user } = await requireUser();

  const { error, fields } = readForm(formData);
  if (error) return { error };

  if (id) {
    // Scoped to this seller so nobody can edit somebody else's expense.
    const ok = await updateExpense(id, fields, user.id);
    if (!ok) return { error: "Expense not found." };
  } else {
    await createExpense({ ...fields, recordedBy: user.id, recordedByName: user.name });
  }

  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
  return {};
}

export async function deleteMyExpenseAction(id) {
  const { user } = await requireUser();

  const ok = await deleteExpense(id, user.id);
  if (!ok) return { error: "Expense not found." };

  revalidatePath("/dashboard/expenses");
  revalidatePath("/dashboard");
  return {};
}
