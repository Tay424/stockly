import { PageHeader } from "@/components/page-header";
import { listExpenses, listPendingExpenses } from "@/lib/finance";

import { AdminExpensesTable } from "./admin-expenses-table";

export default async function ExpensesPage() {
  const [expenses, pending] = await Promise.all([listExpenses(), listPendingExpenses()]);

  return (
    <>
      <PageHeader
        title="Expenses"
        description={
          pending.length
            ? `${pending.length} pending application${pending.length === 1 ? "" : "s"} to review. Only approved expenses hit monthly accounts.`
            : "Direct logs are approved immediately. Attendant applications need your review before they hit the books."
        }
      />
      <AdminExpensesTable initialExpenses={expenses} />
    </>
  );
}
