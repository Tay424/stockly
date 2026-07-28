import { PageHeader } from "@/components/page-header";
import { monthlyAccounts } from "@/lib/finance";

import { AccountsTable } from "./accounts-table";

export default async function AccountsPage() {
  const months = await monthlyAccounts();

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Sales, expenses and profit for each month."
      />
      <AccountsTable initialMonths={months} />
    </>
  );
}
