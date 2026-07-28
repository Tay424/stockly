"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { StatusPill } from "@/components/status-pill";
import { TableEmptyRow, TableToolbar } from "@/components/table-toolbar";
import { TablePagination } from "@/components/table-pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { filterByQuery, filterTriggerClassName } from "@/lib/table-filter";

import { fetchAllMySalesAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function MySalesTable({ initialSales }) {
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const { data: sales } = useQuery({
    queryKey: queryKeys.mySales,
    queryFn: fetchAllMySalesAction,
    initialData: initialSales,
  });

  const filtered = useMemo(() => {
    let rows = filterByQuery(sales, search, (s) => s.productName ?? "");
    if (tierFilter === "retail") rows = rows.filter((s) => !s.wholesale);
    if (tierFilter === "wholesale") rows = rows.filter((s) => s.wholesale);
    if (tierFilter === "discounted") rows = rows.filter((s) => s.discountPercent > 0);
    return rows;
  }, [sales, search, tierFilter]);

  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  const revenue = useMemo(
    () => filtered.reduce((sum, sale) => sum + (sale.totalCents ?? 0), 0),
    [filtered],
  );

  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <TableToolbar
        search={search}
        searchPlaceholder="Search your sales…"
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <span className="text-sm text-muted-foreground">
          Total <span className="font-medium text-foreground tabular-nums">{formatMoney(revenue)}</span>
        </span>
        <Select
          value={tierFilter}
          items={{
            all: "All prices",
            retail: "Retail",
            wholesale: "Wholesale",
            discounted: "Discounted",
          }}
          onValueChange={(value) => {
            setTierFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className={filterTriggerClassName}>
            <SelectValue placeholder="All prices" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All prices</SelectItem>
            <SelectItem value="retail">Retail</SelectItem>
            <SelectItem value="wholesale">Wholesale</SelectItem>
            <SelectItem value="discounted">Discounted</SelectItem>
          </SelectContent>
        </Select>
      </TableToolbar>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead className="text-right">Unit price</TableHead>
              <TableHead>Price used</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>When</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow
                colSpan={6}
                message={
                  search || tierFilter !== "all"
                    ? "No sales match your filters."
                    : "You have not recorded any sales yet."
                }
              />
            ) : (
              paginated.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium text-foreground">{sale.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{sale.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(sale.unitPriceCents)}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1.5">
                      <StatusPill tone={sale.wholesale ? "info" : "muted"}>
                        {sale.wholesale ? "Wholesale" : "Retail"}
                      </StatusPill>
                      {sale.discountPercent > 0 ? (
                        <StatusPill tone="success">{sale.discountPercent}% off</StatusPill>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(sale.totalCents)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {sale.createdAt ? dateFormatter.format(new Date(sale.createdAt)) : "—"}
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
