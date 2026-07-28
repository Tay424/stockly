"use client";

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";

import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
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

import { fetchSalesAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SalesTable({ initialSales }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");

  const { data: sales, isFetching } = useQuery({
    queryKey: queryKeys.sales,
    queryFn: fetchSalesAction,
    initialData: initialSales,
  });

  const filtered = useMemo(() => {
    let rows = filterByQuery(
      sales,
      search,
      (s) => `${s.productName ?? ""} ${s.soldByName ?? ""}`,
    );
    if (tierFilter === "retail") rows = rows.filter((s) => !s.wholesale);
    if (tierFilter === "wholesale") rows = rows.filter((s) => s.wholesale);
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
        searchPlaceholder="Search by product or seller…"
        onSearchChange={(value) => {
          setSearch(value);
          setPage(1);
        }}
      >
        <span className="text-sm text-muted-foreground">
          Total <span className="font-medium text-foreground tabular-nums">{formatMoney(revenue)}</span>
        </span>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Refresh sales"
          disabled={isFetching}
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.sales })}
        >
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
        </Button>
        <Select
          value={tierFilter}
          items={{ all: "All prices", retail: "Retail", wholesale: "Wholesale" }}
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
          </SelectContent>
        </Select>
      </TableToolbar>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Sold by</TableHead>
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
                colSpan={7}
                message={
                  search || tierFilter !== "all"
                    ? "No sales match your filters."
                    : "No sales recorded yet."
                }
              />
            ) : (
              paginated.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium text-foreground">
                    {sale.productName ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{sale.soldByName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{sale.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(sale.unitPriceCents)}
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={sale.wholesale ? "info" : "muted"}>
                      {sale.wholesale ? "Wholesale" : "Retail"}
                    </StatusPill>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(sale.totalCents)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
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
