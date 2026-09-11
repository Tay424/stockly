import { ExportDataButton } from "@/components/export-data-button";
import { PageHeader } from "@/components/page-header";
import { monthlyAccounts } from "@/lib/finance";

import { AccountsTable } from "./accounts-table";

export default async function AccountsPage() {
  const months = await monthlyAccounts();

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Sales, expenses and profit for each month. Export a JSON backup to move this shop to another database."
        action={<ExportDataButton />}
      />
      <AccountsTable initialMonths={months} />
    </>
  );
}
