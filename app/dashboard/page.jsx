import Link from "next/link";

import { ChartPanel, VerticalBarChart } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { listSellableProducts } from "@/lib/catalog";
import { sellerChartData, sellerStats } from "@/lib/finance";
import { formatMoney } from "@/lib/pricing";
import { requireUserLocation } from "@/lib/locations";
import { requireUser } from "@/lib/session";

export default async function DashboardPage() {
  const { user } = await requireUser();
  const loc = await requireUserLocation(user);
  const currency = loc.ok ? loc.location.currency || "USD" : "USD";
  const [products, stats, charts] = await Promise.all([
    listSellableProducts({ locationId: loc.ok ? loc.location.id : null }),
    sellerStats(user.id),
    sellerChartData(user.id),
  ]);

  const inStock = products.reduce((sum, p) => sum + p.stock, 0);
  const money = (cents) => formatMoney(cents, currency);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Your performance today. Record sales from the Sales tab."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          value={money(stats.today.revenueCents)}
          label="You sold today"
          hint={`${stats.today.saleCount} sales · ${stats.today.unitsSold} units`}
        />
        <StatCard
          value={money(stats.month.revenueCents)}
          label="You sold this month"
          hint={`${stats.month.saleCount} sales · ${stats.month.unitsSold} units`}
        />
        <StatCard
          value={money(stats.expensesThisMonth.amountCents)}
          label="You spent this month"
          hint={`${stats.expensesThisMonth.count} expenses recorded`}
        />
        <StatCard
          value={products.length}
          label="Products in stock"
          hint={`${inStock} units on the shelf`}
        />
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Your revenue today"
          description="Hourly totals for sales you recorded — voids do not count."
        >
          <VerticalBarChart
            data={charts.hourly}
            valueKey="revenueCents"
            formatValue={(cents) => formatMoney(cents, currency)}
            emptyMessage="No sales from you yet today."
          />
        </ChartPanel>

        <ChartPanel
          title="Your units today"
          description="Units sold by hour. Use Sales when you’re ready to log the next one."
          action={
            <Button size="sm" render={<Link href="/dashboard/sales" />}>
              Go to Sales
            </Button>
          }
        >
          <VerticalBarChart
            data={charts.hourly}
            valueKey="unitsSold"
            formatValue={(n) => `${n}`}
            emptyMessage="No units sold yet today."
          />
        </ChartPanel>
      </div>
    </>
  );
}
