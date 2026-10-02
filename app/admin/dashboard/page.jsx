import Link from "next/link";

import { ChartPanel, HorizontalBarList, VerticalBarChart } from "@/components/charts";
import { PageHeader } from "@/components/page-header";
import { ShopBackupButtons } from "@/components/shop-backup-buttons";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { adminChartData, adminStats } from "@/lib/finance";
import {
  branchPerformanceMonth,
  branchPerformanceToday,
} from "@/lib/branch-performance";
import { formatMoney } from "@/lib/pricing";

const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

function formatMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

export default async function AdminDashboardPage() {
  const [stats, charts, branchToday, branchMonth] = await Promise.all([
    adminStats(),
    adminChartData(),
    branchPerformanceToday(),
    branchPerformanceMonth(),
  ]);
  const { thisMonth } = stats;
  const { totals, hourly, attendants } = charts;

  const stockHint = stats.outOfStock
    ? `${stats.outOfStock} out of stock`
    : stats.lowStock
      ? `${stats.lowStock} running low`
      : undefined;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`Shop performance for ${charts.periodLabel.toLowerCase()}, with ${formatMonth(stats.month)} context below.`}
        action={<ShopBackupButtons />}
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm text-muted-foreground">
          Integrity stays primary — check movements and voids before leaning on trends.
        </p>
        <Button variant="outline" size="sm" render={<Link href="/admin/integrity" />}>
          Open Integrity
        </Button>
      </div>

      {(stats.needsAttention ?? 0) > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {stats.needsAttention} product{stats.needsAttention === 1 ? "" : "s"} need
            replenishment (threshold-aware).
          </p>
          <Button variant="outline" size="sm" render={<Link href="/admin/inventory" />}>
            View Inventory
          </Button>
        </div>
      ) : null}

      {(stats.notMovingCount ?? 0) > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {stats.notMovingCount} product{stats.notMovingCount === 1 ? "" : "s"} not moving
            this month (sold 0, still on hand).
          </p>
          <Button
            variant="outline"
            size="sm"
            render={<Link href="/admin/inventory?focus=not-moving" />}
          >
            View not moving
          </Button>
        </div>
      ) : null}

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          value={formatMoney(totals.revenueCents)}
          label="Sold today"
          hint={`${totals.saleCount} sales · ${totals.unitsSold} units`}
        />
        <StatCard
          value={formatMoney(thisMonth.revenueCents)}
          label="Sales this month"
          hint={`${thisMonth.saleCount} sales · ${thisMonth.unitsSold} units`}
        />
        <StatCard
          value={formatMoney(thisMonth.profitCents)}
          label="Profit this month"
          hint="Sales minus expenses"
        />
        <StatCard
          value={stats.productCount}
          label="Products"
          hint={stockHint}
        />
      </div>

      <div className="mb-8 overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Branch performance</h2>
          <p className="text-xs text-muted-foreground">
            Harare vs Gweru — sales revenue, approved expenses, and net (today and this month).
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Branch</TableHead>
              <TableHead className="text-right">Today sales</TableHead>
              <TableHead className="text-right">Today expenses</TableHead>
              <TableHead className="text-right">Today net</TableHead>
              <TableHead className="text-right">Month sales</TableHead>
              <TableHead className="text-right">Month expenses</TableHead>
              <TableHead className="text-right">Month net</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(branchToday.byLocation ?? []).map((todayRow) => {
              const monthRow =
                (branchMonth.byLocation ?? []).find(
                  (row) => row.locationId === todayRow.locationId,
                ) ?? {};
              return (
                <TableRow key={todayRow.locationId}>
                  <TableCell className="font-medium text-foreground">
                    {todayRow.locationName}
                    {todayRow.isHub ? (
                      <span className="ml-2 text-xs text-muted-foreground">hub</span>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(todayRow.revenueCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(todayRow.expenseCents)}
                  </TableCell>
                  <TableCell
                    className={
                      todayRow.netCents < 0
                        ? "text-right font-medium tabular-nums text-destructive"
                        : "text-right font-medium tabular-nums"
                    }
                  >
                    {formatMoney(todayRow.netCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(monthRow.revenueCents ?? 0)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(monthRow.expenseCents ?? 0)}
                  </TableCell>
                  <TableCell
                    className={
                      (monthRow.netCents ?? 0) < 0
                        ? "text-right font-medium tabular-nums text-destructive"
                        : "text-right font-medium tabular-nums"
                    }
                  >
                    {formatMoney(monthRow.netCents ?? 0)}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mb-8 grid gap-4 lg:grid-cols-2">
        <ChartPanel
          title="Revenue today"
          description="Shop totals by hour — voided sales are excluded."
        >
          <VerticalBarChart data={hourly} valueKey="revenueCents" formatValue={formatMoney} />
        </ChartPanel>

        <ChartPanel
          title="Per attendant today"
          description="Who moved the till — revenue share for today."
        >
          <div className="-m-4">
            <HorizontalBarList items={attendants} formatValue={formatMoney} />
          </div>
        </ChartPanel>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">Last few months</h2>
            <Link href="/admin/accounts" className="text-xs text-primary hover:underline">
              All accounts
            </Link>
          </div>
          {stats.months.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No sales or expenses yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Month</TableHead>
                  <TableHead className="text-right">Revenue</TableHead>
                  <TableHead className="text-right">Expenses</TableHead>
                  <TableHead className="text-right">Profit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.months.map((m) => (
                  <TableRow key={m.month}>
                    <TableCell className="font-medium text-foreground whitespace-nowrap">
                      {formatMonth(m.month)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(m.revenueCents)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(m.expensesCents)}
                    </TableCell>
                    <TableCell
                      className={
                        m.profitCents < 0
                          ? "text-right font-medium tabular-nums text-destructive"
                          : "text-right font-medium tabular-nums"
                      }
                    >
                      {formatMoney(m.profitCents)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <div>
              <h2 className="text-sm font-medium">This month movers</h2>
              <p className="text-xs text-muted-foreground">
                Top units sold · {stats.notMovingCount ?? 0} not moving
              </p>
            </div>
            <Link href="/admin/inventory" className="text-xs text-primary hover:underline">
              Inventory
            </Link>
          </div>
          {(stats.monthMovers ?? []).length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              No units sold this month yet.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Units</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stats.monthMovers.map((p) => (
                  <TableRow key={p.name}>
                    <TableCell className="font-medium text-foreground">{p.name}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.unitsSold}</TableCell>
                    <TableCell className="text-right tabular-nums">{p.closingStock}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </>
  );
}
