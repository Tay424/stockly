"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { TableEmptyRow, TableToolbar } from "@/components/table-toolbar";
import { TablePagination } from "@/components/table-pagination";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
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
import { Textarea } from "@/components/ui/textarea";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { formatMoney } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import { SALE_STATUS, isSameLocalDay } from "@/lib/stock-ledger";
import { filterByQuery, filterTriggerClassName } from "@/lib/table-filter";

import { fetchAllMySalesAction, requestVoidAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_TONE = {
  [SALE_STATUS.recorded]: "muted",
  [SALE_STATUS.voidRequested]: "warning",
  [SALE_STATUS.voided]: "danger",
};

const STATUS_LABEL = {
  [SALE_STATUS.recorded]: "Recorded",
  [SALE_STATUS.voidRequested]: "Void requested",
  [SALE_STATUS.voided]: "Voided",
};

export function MySalesTable({ initialSales }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");

  const { data: sales } = useQuery({
    queryKey: queryKeys.mySales,
    queryFn: fetchAllMySalesAction,
    initialData: initialSales,
  });

  const voidMutation = useMutation({
    mutationFn: ({ saleId, reason }) => requestVoidAction(saleId, reason),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.mySales });
      toast.success("Void requested — an admin will review it.");
      setVoidTarget(null);
      setVoidReason("");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const filtered = useMemo(() => {
    let rows = filterByQuery(
      sales,
      search,
      (s) => `${s.productName ?? ""} ${s.clientName ?? ""} ${s.clientPhone ?? ""}`,
    );
    if (tierFilter === "retail") rows = rows.filter((s) => !s.wholesale);
    if (tierFilter === "wholesale") rows = rows.filter((s) => s.wholesale);
    if (tierFilter === "discounted") rows = rows.filter((s) => s.discountPercent > 0);
    return rows;
  }, [sales, search, tierFilter]);

  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  const revenue = useMemo(
    () =>
      filtered
        .filter((sale) => sale.status !== SALE_STATUS.voided)
        .reduce((sum, sale) => sum + (sale.totalCents ?? 0), 0),
    [filtered],
  );

  function canRequestVoid(sale) {
    return (
      sale.status === SALE_STATUS.recorded &&
      sale.createdAt &&
      isSameLocalDay(new Date(sale.createdAt))
    );
  }

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
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow
                colSpan={8}
                message={
                  search || tierFilter !== "all"
                    ? "No sales match your filters."
                    : "No sales in the last 24 hours."
                }
              />
            ) : (
              paginated.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium text-foreground">{sale.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{sale.quantity}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {sale.unitPriceCents == null ? "—" : formatMoney(sale.unitPriceCents)}
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
                  <TableCell>
                    <StatusPill tone={STATUS_TONE[sale.status] ?? "muted"}>
                      {STATUS_LABEL[sale.status] ?? sale.status}
                    </StatusPill>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {sale.createdAt ? dateFormatter.format(new Date(sale.createdAt)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      <Button
                        variant="outline"
                        size="sm"
                        render={
                          <Link href={`/dashboard/sales/${sale.id}/invoice`} target="_blank" />
                        }
                      >
                        Invoice
                      </Button>
                      {canRequestVoid(sale) ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setVoidReason("");
                            setVoidTarget(sale);
                          }}
                        >
                          Request void
                        </Button>
                      ) : sale.status === SALE_STATUS.voidRequested ? (
                        <span className="text-xs text-muted-foreground">Awaiting admin</span>
                      ) : null}
                    </div>
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

      <Dialog
        open={voidTarget !== null}
        onOpenChange={(open) => {
          if (!open) {
            setVoidTarget(null);
            setVoidReason("");
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Request void</DialogTitle>
            <DialogDescription>
              Same-day sales only. An admin must approve before stock is restored — you cannot
              edit sales yourself.
            </DialogDescription>
          </DialogHeader>
          {voidTarget ? (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{voidTarget.productName}</span>
                {" · "}
                {voidTarget.quantity} unit{voidTarget.quantity === 1 ? "" : "s"} ·{" "}
                {formatMoney(voidTarget.totalCents)}
                {Array.isArray(voidTarget.lines) && voidTarget.lines.length > 1
                  ? ` · ${voidTarget.lines.length} lines`
                  : ""}
              </p>
              <div className="grid gap-2">
                <Label htmlFor="void-reason">Reason</Label>
                <Textarea
                  id="void-reason"
                  rows={3}
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  placeholder="Why should this sale be voided?"
                />
              </div>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setVoidTarget(null);
                    setVoidReason("");
                  }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  disabled={voidMutation.isPending || !voidReason.trim()}
                  onClick={() =>
                    voidMutation.mutate({ saleId: voidTarget.id, reason: voidReason.trim() })
                  }
                >
                  {voidMutation.isPending ? "Submitting…" : "Submit request"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
