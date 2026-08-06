"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { StatCard } from "@/components/stat-card";
import { TableEmptyRow, TableToolbar } from "@/components/table-toolbar";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatMoney } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import { MOVEMENT_TYPE } from "@/lib/stock-ledger";
import { cn } from "@/lib/utils";

import { executeVoidAction } from "../sales/actions";
import { fetchIntegrityAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const MOVEMENT_LABEL = {
  [MOVEMENT_TYPE.sale]: "Sale",
  [MOVEMENT_TYPE.void]: "Void",
  [MOVEMENT_TYPE.adminAdjust]: "Admin adjust",
};

const MOVEMENT_TONE = {
  [MOVEMENT_TYPE.sale]: "info",
  [MOVEMENT_TYPE.void]: "warning",
  [MOVEMENT_TYPE.adminAdjust]: "muted",
};

export function IntegrityView({ initialSnapshot }) {
  const queryClient = useQueryClient();
  const [movementSearch, setMovementSearch] = useState("");
  const [voidTarget, setVoidTarget] = useState(null);
  const [voidReason, setVoidReason] = useState("");

  const { data: snapshot, isFetching } = useQuery({
    queryKey: queryKeys.integrity,
    queryFn: fetchIntegrityAction,
    initialData: initialSnapshot,
  });

  const voidMutation = useMutation({
    mutationFn: ({ saleId, reason }) => executeVoidAction(saleId, reason),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.integrity }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sales }),
        queryClient.invalidateQueries({ queryKey: queryKeys.pendingVoids }),
        queryClient.invalidateQueries({ queryKey: queryKeys.products }),
      ]);
      toast.success("Sale voided — stock restored.");
      setVoidTarget(null);
      setVoidReason("");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const { summary, discrepancies, products, movements, pendingVoids } = snapshot;

  const filteredMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    if (!q) return movements;
    return movements.filter((m) =>
      `${m.productName ?? ""} ${m.reason ?? ""} ${m.createdByName ?? ""} ${m.type ?? ""}`
        .toLowerCase()
        .includes(q),
    );
  }, [movements, movementSearch]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Period: <span className="font-medium text-foreground">{snapshot.period.label}</span>
          {snapshot.period.start ? (
            <span className="ml-2 tabular-nums">
              ({dateFormatter.format(new Date(snapshot.period.start))})
            </span>
          ) : null}
        </p>
        <Button
          variant="outline"
          size="sm"
          disabled={isFetching}
          onClick={() => queryClient.invalidateQueries({ queryKey: queryKeys.integrity })}
        >
          <RefreshCwIcon className={isFetching ? "size-4 animate-spin" : "size-4"} />
          Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          value={summary.salesCount}
          label="Active sales today"
          hint={`${summary.salesUnits} units · ${formatMoney(summary.salesRevenueCents)}`}
        />
        <StatCard
          value={summary.movementsCount}
          label="Stock movements"
          hint={`${summary.adjustCount} admin adjusts · net ${summary.adjustNetUnits >= 0 ? "+" : ""}${summary.adjustNetUnits}`}
        />
        <StatCard
          value={summary.voidedCount}
          label="Voids today"
          hint={`${summary.voidedUnits} units restored`}
        />
        <StatCard
          value={summary.discrepancyCount}
          label="Discrepancies"
          hint={
            summary.discrepancyCount === 0
              ? "Sales and ledger match"
              : "Review highlighted rows below"
          }
        />
      </div>

      {summary.discrepancyCount > 0 ? (
        <section className="overflow-hidden rounded-lg border border-destructive/30 bg-card">
          <div className="border-b border-destructive/20 bg-destructive/5 px-4 py-3">
            <h2 className="text-sm font-medium text-destructive">
              Discrepancies ({discrepancies.length})
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Products or sales that do not line up with the stock movement ledger.
            </p>
          </div>
          <ul className="divide-y divide-border">
            {discrepancies.map((d, index) => (
              <li key={`${d.kind}-${d.saleId ?? d.movementId ?? index}`} className="px-4 py-3">
                <p className="text-sm text-foreground">{d.message}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {d.kind.replaceAll("_", " ")}
                  {d.expected != null ? ` · expected ${d.expected}` : ""}
                  {d.actual != null ? ` · actual ${d.actual}` : ""}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {pendingVoids.length > 0 ? (
        <section className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">Pending void requests</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Attendants asked to void these sales — execute to restore stock.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Seller</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Reason</TableHead>
                <TableHead>Requested</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingVoids.map((sale) => (
                <TableRow key={sale.id}>
                  <TableCell className="font-medium">{sale.productName}</TableCell>
                  <TableCell className="text-muted-foreground">{sale.soldByName ?? "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{sale.quantity}</TableCell>
                  <TableCell className="max-w-xs truncate text-muted-foreground">
                    {sale.voidRequestReason ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {sale.voidRequestedAt
                      ? dateFormatter.format(new Date(sale.voidRequestedAt))
                      : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      onClick={() => {
                        setVoidReason(sale.voidRequestReason ?? "");
                        setVoidTarget(sale);
                      }}
                    >
                      Execute void
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Products today</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Sold and voided units versus ledger movements. Mismatches are highlighted.
          </p>
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead className="text-right">Sold</TableHead>
              <TableHead className="text-right">Sale ledger</TableHead>
              <TableHead className="text-right">Voided</TableHead>
              <TableHead className="text-right">Void ledger</TableHead>
              <TableHead className="text-right">Adjust</TableHead>
              <TableHead>Match</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {products.length === 0 ? (
              <TableEmptyRow colSpan={7} message="No sales or stock movements today." />
            ) : (
              products.map((row) => (
                <TableRow
                  key={row.key}
                  className={cn(!row.ok && "bg-destructive/5")}
                >
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.soldUnits}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.saleMovementUnits}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.voidedUnits}</TableCell>
                  <TableCell className="text-right tabular-nums">{row.voidMovementUnits}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {row.adjustUnits > 0 ? `+${row.adjustUnits}` : row.adjustUnits}
                  </TableCell>
                  <TableCell>
                    <StatusPill tone={row.ok ? "success" : "danger"}>
                      {row.ok ? "OK" : "Mismatch"}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          search={movementSearch}
          searchPlaceholder="Search movements…"
          onSearchChange={setMovementSearch}
        >
          <span className="text-sm text-muted-foreground">
            {filteredMovements.length} movement{filteredMovements.length === 1 ? "" : "s"}
          </span>
        </TableToolbar>
        <div className="border-b border-border px-4 py-2">
          <h2 className="text-sm font-medium">Stock movements today</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Delta</TableHead>
                <TableHead className="text-right">Stock after</TableHead>
                <TableHead>Who</TableHead>
                <TableHead>Why</TableHead>
                <TableHead>Ref</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredMovements.length === 0 ? (
                <TableEmptyRow
                  colSpan={8}
                  message={
                    movementSearch
                      ? "No movements match your search."
                      : "No stock movements recorded today."
                  }
                />
              ) : (
                filteredMovements.map((m) => (
                  <TableRow key={m.id}>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {m.createdAt ? dateFormatter.format(new Date(m.createdAt)) : "—"}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={MOVEMENT_TONE[m.type] ?? "muted"}>
                        {MOVEMENT_LABEL[m.type] ?? m.type}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="font-medium">{m.productName ?? "—"}</TableCell>
                    <TableCell
                      className={cn(
                        "text-right tabular-nums font-medium",
                        (m.quantityDelta ?? 0) < 0 && "text-destructive",
                      )}
                    >
                      {(m.quantityDelta ?? 0) > 0 ? `+${m.quantityDelta}` : m.quantityDelta}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.stockAfter ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{m.createdByName ?? "—"}</TableCell>
                    <TableCell className="max-w-xs truncate text-muted-foreground">
                      {m.reason ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {m.refType && m.refId ? `${m.refType}:${m.refId.slice(-6)}` : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </section>

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
            <DialogTitle>Execute void</DialogTitle>
            <DialogDescription>
              Restores stock and writes a void movement. This cannot be undone from the UI.
            </DialogDescription>
          </DialogHeader>
          {voidTarget ? (
            <div className="grid gap-4">
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{voidTarget.productName}</span>
                {" · "}
                {voidTarget.quantity} units · {voidTarget.soldByName ?? "—"}
              </p>
              <div className="grid gap-2">
                <Label htmlFor="integrity-void-reason">Void reason</Label>
                <Textarea
                  id="integrity-void-reason"
                  rows={3}
                  value={voidReason}
                  onChange={(event) => setVoidReason(event.target.value)}
                />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setVoidTarget(null)}>
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
