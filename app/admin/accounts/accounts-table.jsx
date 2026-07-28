"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";

import { EmptyState } from "@/components/page-header";
import { StatCard } from "@/components/stat-card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";

import { fetchAccountsAction } from "./actions";

const monthFormatter = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric" });

/** "2026-07" -> "July 2026". Parsed as UTC to match how the months are keyed. */
function formatMonth(key) {
  const [year, month] = key.split("-").map(Number);
  return monthFormatter.format(new Date(Date.UTC(year, month - 1, 1)));
}

const profitClass = (cents) =>
  cn("font-medium tabular-nums", cents < 0 ? "text-destructive" : "text-foreground");

export function AccountsTable({ initialMonths }) {
  const { data: months } = useQuery({
    queryKey: queryKeys.accounts,
    queryFn: fetchAccountsAction,
    initialData: initialMonths,
  });

  const totals = useMemo(
    () =>
      months.reduce(
        (acc, m) => ({
          revenueCents: acc.revenueCents + m.revenueCents,
          expensesCents: acc.expensesCents + m.expensesCents,
          profitCents: acc.profitCents + m.profitCents,
        }),
        { revenueCents: 0, expensesCents: 0, profitCents: 0 },
      ),
    [months],
  );

  if (months.length === 0) {
    return <EmptyState>Nothing to account for yet — record a sale or an expense.</EmptyState>;
  }

  return (
    <>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <StatCard value={formatMoney(totals.revenueCents)} label="Sales, all time" />
        <StatCard value={formatMoney(totals.expensesCents)} label="Expenses, all time" />
        <StatCard
          value={formatMoney(totals.profitCents)}
          label="Profit, all time"
          hint="Sales minus expenses"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Month</TableHead>
                <TableHead className="text-right">Sales</TableHead>
                <TableHead className="text-right">Units</TableHead>
                <TableHead className="text-right">Revenue</TableHead>
                <TableHead className="text-right">Expenses</TableHead>
                <TableHead className="text-right">Profit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {months.map((m) => (
                <TableRow key={m.month}>
                  <TableCell className="font-medium text-foreground whitespace-nowrap">
                    {formatMonth(m.month)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{m.saleCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{m.unitsSold}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(m.revenueCents)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(m.expensesCents)}
                  </TableCell>
                  <TableCell className={cn("text-right", profitClass(m.profitCents))}>
                    {formatMoney(m.profitCents)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </>
  );
}
