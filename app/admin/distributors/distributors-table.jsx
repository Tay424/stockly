"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { TableEmptyRow, TableToolbar } from "@/components/table-toolbar";
import { TablePagination } from "@/components/table-pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { formatMoney } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import { filterByQuery } from "@/lib/table-filter";

import { fetchDistributorPerformanceAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function DistributorsTable({ initialDistributors }) {
  const [search, setSearch] = useState("");

  const { data: distributors } = useQuery({
    queryKey: queryKeys.distributorPerformance,
    queryFn: fetchDistributorPerformanceAction,
    initialData: initialDistributors,
  });

  const filtered = useMemo(
    () =>
      filterByQuery(
        distributors,
        search,
        (d) => `${d.name ?? ""} ${d.phone ?? ""}`,
      ),
    [distributors, search],
  );

  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <TableToolbar
        search={search}
        searchPlaceholder="Search distributors…"
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Name</TableHead>
              <TableHead>Phone</TableHead>
              <TableHead className="text-right">Sales</TableHead>
              <TableHead className="text-right">Units</TableHead>
              <TableHead className="text-right">Revenue</TableHead>
              <TableHead>Last sale</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow
                colSpan={6}
                message={
                  search
                    ? "No distributors match your search."
                    : "No clients yet — they appear when a sale captures name + phone."
                }
              />
            ) : (
              paginated.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {row.phone}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.saleCount ?? 0}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.unitsSold ?? 0}</TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(row.revenueCents ?? 0)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {row.lastSaleAt
                      ? dateFormatter.format(new Date(row.lastSaleAt))
                      : "—"}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
      <TablePagination
        page={page}
        pageSize={pageSize}
        totalItems={totalItems}
        totalPages={totalPages}
        onPageChange={setPage}
      />
    </div>
  );
}
