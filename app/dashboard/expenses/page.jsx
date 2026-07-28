import { PageHeader } from "@/components/page-header";
import { listExpensesBy } from "@/lib/finance";
import { requireUser } from "@/lib/session";

import { MyExpensesTable } from "./my-expenses-table";

export default async function MyExpensesPage() {
  const { user } = await requireUser();
  const expenses = await listExpensesBy(user.id);

  return (
    <>
      <PageHeader
        title="Expenses"
        description="Money you spent for the shop. Your admin sees these in the monthly accounts."
      />
      <MyExpensesTable initialExpenses={expenses} />
    </>
  );
}
