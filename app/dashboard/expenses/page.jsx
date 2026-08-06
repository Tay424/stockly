import { PageHeader } from "@/components/page-header";
import { EXPENSE_STATUS } from "@/lib/expense-constants";
import { listExpensesBy } from "@/lib/finance";
import { requireUser } from "@/lib/session";

import { MyExpensesTable } from "./my-expenses-table";

export default async function MyExpensesPage() {
  const { user } = await requireUser();
  const expenses = await listExpensesBy(user.id);
  const needsChanges = expenses.filter((e) => e.status === EXPENSE_STATUS.changesRequested).length;

  return (
    <>
      <PageHeader
        title="Expenses"
        description={
          needsChanges
            ? `${needsChanges} need changes before they can be approved.`
            : "Apply with a receipt. Pending applications stay out of monthly accounts until approved."
        }
      />
      <MyExpensesTable initialExpenses={expenses} />
    </>
  );
}
