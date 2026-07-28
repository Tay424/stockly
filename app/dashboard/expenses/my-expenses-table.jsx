"use client";

import { ExpensesTable } from "@/components/expenses-table";
import { queryKeys } from "@/lib/query-keys";

import { deleteMyExpenseAction, fetchMyExpensesAction, saveMyExpenseAction } from "./actions";

export function MyExpensesTable({ initialExpenses }) {
  return (
    <ExpensesTable
      initialExpenses={initialExpenses}
      queryKey={queryKeys.myExpenses}
      fetchAction={fetchMyExpensesAction}
      saveAction={saveMyExpenseAction}
      deleteAction={deleteMyExpenseAction}
    />
  );
}
