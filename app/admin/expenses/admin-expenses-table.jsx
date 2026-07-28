"use client";

import { ExpensesTable } from "@/components/expenses-table";
import { queryKeys } from "@/lib/query-keys";

import { deleteExpenseAction, fetchExpensesAction, saveExpenseAction } from "./actions";

export function AdminExpensesTable({ initialExpenses }) {
  return (
    <ExpensesTable
      initialExpenses={initialExpenses}
      queryKey={queryKeys.expenses}
      fetchAction={fetchExpensesAction}
      saveAction={saveExpenseAction}
      deleteAction={deleteExpenseAction}
      showRecordedBy
    />
  );
}
