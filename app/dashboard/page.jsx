import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { listSellableProducts } from "@/lib/catalog";
import { sellerStats } from "@/lib/finance";
import { formatMoney } from "@/lib/pricing";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const { user } = await requireUser();
  const [products, stats] = await Promise.all([
    listSellableProducts(),
    sellerStats(user.id),
  ]);

  const inStock = products.reduce((sum, p) => sum + p.stock, 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your overview for today. Record sales from the Sales tab."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          value={formatMoney(stats.today.revenueCents)}
          label="You sold today"
          hint={`${stats.today.saleCount} sales · ${stats.today.unitsSold} units`}
        />
        <StatCard
          value={formatMoney(stats.month.revenueCents)}
          label="You sold this month"
          hint={`${stats.month.saleCount} sales · ${stats.month.unitsSold} units`}
        />
        <StatCard
          value={formatMoney(stats.expensesThisMonth.amountCents)}
          label="You spent this month"
          hint={`${stats.expensesThisMonth.count} expenses recorded`}
        />
        <StatCard
          value={products.length}
          label="Products in stock"
          hint={`${inStock} units on the shelf`}
        />
      </div>

      <div className="flex flex-col items-start gap-3 rounded-lg border border-border bg-card p-6">
        <p className="text-sm text-muted-foreground">
          Ready to log a sale? Use Sales for a fast product + quantity flow. Charts land in a
          later phase.
        </p>
        <Button render={<Link href="/dashboard/sales" />}>Go to Sales</Button>
      </div>
    </>
  );
}
