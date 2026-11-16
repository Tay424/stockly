import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { ShopBackupButtons } from "@/components/shop-backup-buttons";
import { Button } from "@/components/ui/button";
import { monthlyAccounts } from "@/lib/finance";

import { AccountsTable } from "./accounts-table";

export default async function AccountsPage({ searchParams }) {
  const params = await searchParams;
  const currency = params?.currency === "ZAR" ? "ZAR" : "USD";
  const months = await monthlyAccounts(currency);

  return (
    <>
      <PageHeader
        title="Accounts"
        description={`Sales, expenses and profit in ${currency}. Dollar and rand are not added together.`}
        action={
          <div className="flex items-center gap-2">
            <Button variant={currency === "USD" ? "default" : "outline"} size="sm" render={<Link href="/admin/accounts" />}>
              USD
            </Button>
            <Button variant={currency === "ZAR" ? "default" : "outline"} size="sm" render={<Link href="/admin/accounts?currency=ZAR" />}>
              ZAR
            </Button>
            <ShopBackupButtons />
          </div>
        }
      />
      <AccountsTable initialMonths={months} currency={currency} />
    </>
  );
}
