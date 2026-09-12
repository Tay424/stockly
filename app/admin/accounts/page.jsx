import { PageHeader } from "@/components/page-header";
import { ShopBackupButtons } from "@/components/shop-backup-buttons";
import { monthlyAccounts } from "@/lib/finance";

import { AccountsTable } from "./accounts-table";

export default async function AccountsPage() {
  const months = await monthlyAccounts();

  return (
    <>
      <PageHeader
        title="Accounts"
        description="Sales, expenses and profit for each month. Export or import a JSON backup to move this shop between databases."
        action={<ShopBackupButtons />}
      />
      <AccountsTable initialMonths={months} />
    </>
  );
}
