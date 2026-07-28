import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { listSalesBySeller, listSellableProducts } from "@/lib/catalog";
import { sellerStats } from "@/lib/finance";
import { formatMoney } from "@/lib/pricing";
import { requireUser } from "@/lib/session";

import { SellForm } from "./sell-form";

export default async function DashboardPage() {
  const { user } = await requireUser();
  const [products, sales, stats] = await Promise.all([
    listSellableProducts(),
    listSalesBySeller(user.id),
    sellerStats(user.id),
  ]);

  const inStock = products.reduce((sum, p) => sum + p.stock, 0);

  return (
    <>
      <PageHeader title="Dashboard" description="Record a sale — stock updates automatically." />

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

      <SellForm initialProducts={products} initialSales={sales} />
    </>
  );
}
