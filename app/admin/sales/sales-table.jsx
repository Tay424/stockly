"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
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
import { Textarea } from "@/components/ui/textarea";
import { useTablePagination } from "@/hooks/use-table-pagination";
import { formatMoney } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import { SALE_STATUS } from "@/lib/stock-ledger";
import { filterByQuery, filterTriggerClassName } from "@/lib/table-filter";

import { executeVoidAction, fetchSalesAction } from "./actions";

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

export function SalesTable({ initialSales }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");

  const { data: sales, isFetching } = useQuery({
    queryKey: queryKeys.sales,
    queryFn: fetchSalesAction,
    initialData: initialSales,
  });

  const voidMutation = useMutation({
    mutationFn: ({ saleId, reason }) => executeVoidAction(saleId, reason),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sales }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pendingVoids }),
        queryClient.invalidateQueries({ queryKey: queryKeys.integrity }),
        queryClient.invalidateQueries({ queryKey: queryKeys.products }),
      ]);
      toast.success("Sale voided — stock restored.");
      setVoidTarget(null);
      setVoidReason("");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const filtered = useMemo(() => {
    let rows = filterByQuery(
      sales,
      search,
      (s) => `${s.productName ?? ""} ${s.soldByName ?? ""}`,
    );
    if (tierFilter === "retail") rows = rows.filter((s) => !s.wholesale);
    if (tierFilter === "wholesale") rows = rows.filter((s) => s.wholesale);
    if (statusFilter !== "all") rows = rows.filter((s) => s.status === statusFilter);
    return rows;
  }, [sales, search, tierFilter, statusFilter]);

  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  const revenue = useMemo(
    () =>
      filtered
        .filter((sale) => sale.status !== SALE_STATUS.voided)
        .reduce((sum, sale) => sum + (sale.totalCents ?? 0), 0),
    [filtered],
  );

  function openVoid(sale) {
    setVoidReason(
      sale.status === SALE_STATUS.voidRequested ? (sale.voidRequestReason ?? "") : "",
    );
    setVoidTarget(sale);
  }

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
          value={statusFilter}
          items={{
            all: "All statuses",
            [SALE_STATUS.recorded]: "Recorded",
            [SALE_STATUS.voidRequested]: "Void requested",
            [SALE_STATUS.voided]: "Voided",
          }}
          onValueChange={(value) => {
            setStatusFilter(value);
            setPage(1);
          }}
        >
          <SelectTrigger className={filterTriggerClassName}>
            <SelectValue placeholder="All statuses" />
          </SelectTrigger>
          <SelectContent align="end">
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value={SALE_STATUS.recorded}>Recorded</SelectItem>
            <SelectItem value={SALE_STATUS.voidRequested}>Void requested</SelectItem>
            <SelectItem value={SALE_STATUS.voided}>Voided</SelectItem>
          </SelectContent>
        </Select>
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
              <TableHead>Status</TableHead>
              <TableHead>When</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableEmptyRow
                colSpan={9}
                message={
                  search || tierFilter !== "all" || statusFilter !== "all"
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
                    {sale.unitPriceCents == null ? "—" : formatMoney(sale.unitPriceCents)}
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={sale.wholesale ? "info" : "muted"}>
                      {sale.wholesale ? "Wholesale" : "Retail"}
                    </StatusPill>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatMoney(sale.totalCents)}
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={STATUS_TONE[sale.status] ?? "muted"}>
                      {STATUS_LABEL[sale.status] ?? sale.status}
                    </StatusPill>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {sale.createdAt ? dateFormatter.format(new Date(sale.createdAt)) : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {sale.status !== SALE_STATUS.voided ? (
                      <Button
                        variant={sale.status === SALE_STATUS.voidRequested ? "default" : "outline"}
                        size="sm"
                        onClick={() => openVoid(sale)}
                      >
                        {sale.status === SALE_STATUS.voidRequested ? "Execute void" : "Void"}
                      </Button>
                    ) : (
                      <span className="text-xs text-muted-foreground">Voided</span>
                    )}
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
            <DialogTitle>Void sale</DialogTitle>
            <DialogDescription>
              Restores stock and writes a void movement to the ledger. Admins can void sales of
              any age.
            </DialogDescription>
          </DialogHeader>
          {voidTarget ? (
            <div className="grid gap-4">
              <div className="text-sm text-muted-foreground">
                <p>
                  <span className="font-medium text-foreground">{voidTarget.productName}</span>
                  {" · "}
                  {voidTarget.quantity} unit{voidTarget.quantity === 1 ? "" : "s"} ·{" "}
                  {formatMoney(voidTarget.totalCents)}
                  {Array.isArray(voidTarget.lines) && voidTarget.lines.length > 1
                    ? ` · ${voidTarget.lines.length} lines`
                    : ""}
                </p>
                <p className="mt-1">
                  Sold by {voidTarget.soldByName ?? "—"}
                  {voidTarget.createdAt
                    ? ` · ${dateFormatter.format(new Date(voidTarget.createdAt))}`
                    : ""}
                </p>
                {voidTarget.status === SALE_STATUS.voidRequested && voidTarget.voidRequestReason ? (
                  <p className="mt-2 rounded-md bg-secondary/60 px-3 py-2 text-foreground">
                    Request reason: {voidTarget.voidRequestReason}
                  </p>
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-void-reason">Void reason</Label>
                <Textarea
                  id="admin-void-reason"
                  rows={3}
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                  placeholder="Why is this sale being voided?"
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
                  {voidMutation.isPending ? "Voiding…" : "Confirm void"}
                </Button>
              </DialogFooter>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
