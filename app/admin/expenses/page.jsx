import { PageHeader } from "@/components/page-header";
import { listExpenses } from "@/lib/finance";

import { AdminExpensesTable } from "./admin-expenses-table";

export default async function ExpensesPage() {
  const expenses = await listExpenses();

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Everything the shop spends, including what your sellers record. These come off revenue in the monthly accounts."
      />
      <AdminExpensesTable initialExpenses={expenses} />
    </>
  );
}
