"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { PackagePlusIcon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
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
import { sortPerformanceTable } from "@/lib/month-product-performance";
import { queryKeys } from "@/lib/query-keys";
import { filterByQuery, filterTriggerClassName } from "@/lib/table-filter";

import {
  fetchInventoryHealthAction,
  fetchMonthInventoryAction,
  fetchRecentReceivesAction,
  fetchSellableLocationsAction,
  receiveStockAction,
} from "./actions";
import { TransfersPanel } from "./transfers-panel";

const STATUS_TONES = {
  out: "danger",
  low: "warning",
  ok: "success",
};

const STATUS_LABELS = {
  out: "Out of stock",
  low: "Low",
  ok: "OK",
};

const FILTER_ITEMS = [
  { value: "all", label: "All" },
  { value: "low", label: "Low" },
  { value: "out", label: "Out of stock" },
  { value: "needs", label: "Needs replenishment" },
];

const PERF_FILTER_ITEMS = [
  { value: "all", label: "All" },
  { value: "moving", label: "Moving" },
  { value: "not-moving", label: "Not moving" },
];

const receivedAtFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function nowLocalDateTimeInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function InventoryView({
  initialHealth,
  initialMonth,
  initialReceives = [],
  initialFocus = null,
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [perfSearch, setPerfSearch] = useState("");
  const [perfFilter, setPerfFilter] = useState(
    initialFocus === "not-moving" ? "not-moving" : "all",
  );
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveProductId, setReceiveProductId] = useState("");
  const [receiveLocationId, setReceiveLocationId] = useState("");

  const { data: health } = useQuery({
    queryKey: queryKeys.inventoryHealth,
    queryFn: fetchInventoryHealthAction,
    initialData: initialHealth,
  });

  const { data: locations = [] } = useQuery({
    queryKey: queryKeys.locations,
    queryFn: fetchSellableLocationsAction,
  });

  const { data: month } = useQuery({
    queryKey: queryKeys.inventoryMonth,
    queryFn: () => fetchMonthInventoryAction(initialMonth.monthKey),
    initialData: initialMonth,
  });

  const { data: receives } = useQuery({
    queryKey: [...queryKeys.inventoryReceives, initialMonth.monthKey],
    queryFn: () => fetchRecentReceivesAction(initialMonth.monthKey),
    initialData: initialReceives,
  });

  const receiveMutation = useMutation({
    mutationFn: (formData) => receiveStockAction(formData),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.inventoryHealth }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventoryMonth }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventoryReceives }),
        queryClient.invalidateQueries({ queryKey: queryKeys.products }),
        queryClient.invalidateQueries({ queryKey: queryKeys.stockTransfers }),
      ]);
      toast.success("Stock received.");
      setReceiveOpen(false);
      setReceiveProductId("");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const hubLocationId = locations.find((l) => l.isHub)?.id ?? "";

  const filtered = useMemo(() => {
    let rows = filterByQuery(
      health?.items ?? [],
      search,
      (p) => `${p.name} ${p.categoryName ?? ""}`,
    );
    if (statusFilter === "low") rows = rows.filter((p) => p.status === "low");
    else if (statusFilter === "out") rows = rows.filter((p) => p.status === "out");
    else if (statusFilter === "needs") {
      rows = rows.filter((p) => p.status === "low" || p.status === "out");
    }
    return rows;
  }, [health, search, statusFilter]);

  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  const performanceFiltered = useMemo(() => {
    let rows = filterByQuery(
      month?.rows ?? [],
      perfSearch,
      (p) => `${p.productName} ${p.categoryName ?? ""}`,
    );
    if (perfFilter === "moving") rows = rows.filter((p) => !p.notMoving && (p.sold ?? 0) > 0);
    else if (perfFilter === "not-moving") rows = rows.filter((p) => p.notMoving);
    return sortPerformanceTable(rows, { focusNotMoving: perfFilter === "not-moving" });
  }, [month, perfSearch, perfFilter]);

  const {
    page: perfPage,
    paginated: perfPaginated,
    setPage: setPerfPage,
    totalItems: perfTotalItems,
    totalPages: perfTotalPages,
    pageSize: perfPageSize,
  } = useTablePagination(performanceFiltered);

  function openReceive(productId = "") {
    setReceiveProductId(productId);
    setReceiveOpen(true);
  }

  function onReceiveSubmit(event) {
    event.preventDefault();
    if (!receiveProductId) {
      toast.error("Pick a product.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("productId", receiveProductId);
    formData.set("locationId", receiveLocationId || hubLocationId);
    receiveMutation.mutate(formData);
  }

  const counts = health?.counts ?? {
    total: 0,
    low: 0,
    out: 0,
    needsAttention: 0,
    ok: 0,
  };

  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Opening stock ({month.monthKey})</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{month.openingStock}</p>
          <p className="text-xs text-muted-foreground">Units carried into this month</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Received this month</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{month.received}</p>
          <p className="text-xs text-muted-foreground">From Inventory receive</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Sold this month</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{month.sold ?? 0}</p>
          <p className="text-xs text-muted-foreground">Units from sales (voids excluded)</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Not moving</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{month.notMovingCount ?? 0}</p>
          <p className="text-xs text-muted-foreground">Sold 0 · still on hand</p>
        </div>
        <div className="rounded-lg border border-border bg-card px-4 py-3">
          <p className="text-xs text-muted-foreground">Needs replenishment</p>
          <p className="mt-1 text-2xl font-medium tabular-nums">{counts.needsAttention}</p>
          <p className="text-xs text-muted-foreground">
            {counts.low} low · {counts.out} out
          </p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Ledger disputes stay on{" "}
          <Link href="/admin/integrity" className="text-primary hover:underline">
            Integrity
          </Link>
          .
        </p>
        <Button onClick={() => openReceive()} disabled={(health?.items ?? []).length === 0}>
          <PackagePlusIcon />
          Receive stock
        </Button>
      </div>

      <div className="mb-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">This month by product</h2>
          <p className="text-xs text-muted-foreground">
            Units only — wholesale pack revenue is not attributed to a single SKU. Not moving =
            sold 0 this month with stock still on hand.
          </p>
        </div>
        <TableToolbar
          search={perfSearch}
          searchPlaceholder="Search month performance…"
          onSearchChange={(value) => {
            setPerfSearch(value);
            setPerfPage(1);
          }}
        >
          <Select
            value={perfFilter}
            onValueChange={(value) => {
              setPerfFilter(value);
              setPerfPage(1);
            }}
          >
            <SelectTrigger className={filterTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERF_FILTER_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableToolbar>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Opening</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Sold</TableHead>
                <TableHead className="text-right">Closing</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perfPaginated.length === 0 ? (
                <TableEmptyRow
                  colSpan={7}
                  message={
                    perfFilter === "not-moving"
                      ? "No not-moving products this month."
                      : "No products match this filter."
                  }
                />
              ) : (
                perfPaginated.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-foreground">
                      {row.productName}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.categoryName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.openingStock}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.received}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.sold}</TableCell>
                    <TableCell className="text-right tabular-nums">{row.closingStock}</TableCell>
                    <TableCell>
                      {row.notMoving ? (
                        <StatusPill tone="warning">Not moving</StatusPill>
                      ) : (row.sold ?? 0) > 0 ? (
                        <StatusPill tone="success">Moving</StatusPill>
                      ) : (
                        <StatusPill tone="muted">No stock</StatusPill>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
        <TablePagination
          page={perfPage}
          pageSize={perfPageSize}
          totalItems={perfTotalItems}
          totalPages={perfTotalPages}
          onPageChange={setPerfPage}
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Stock on hand</h2>
          <p className="text-xs text-muted-foreground">
            Current levels and low-stock status — receive replenishment from here.
          </p>
        </div>
        <TableToolbar
          search={search}
          searchPlaceholder="Search inventory…"
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        >
          <Select
            value={statusFilter}
            onValueChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className={filterTriggerClassName}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FILTER_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableToolbar>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">On hand</TableHead>
                <TableHead className="text-right">Low at</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginated.length === 0 ? (
                <TableEmptyRow colSpan={6} message="No products match this filter." />
              ) : (
                paginated.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium text-foreground">{row.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.categoryName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.stock}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.lowStockThreshold}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={STATUS_TONES[row.status]}>
                        {STATUS_LABELS[row.status]}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="outline" size="sm" onClick={() => openReceive(row.id)}>
                        Receive
                      </Button>
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

      <div className="mt-6 overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Receives this month</h2>
          <p className="text-xs text-muted-foreground">
            Who received stock into the shop — attendants and admins.
          </p>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Received by</TableHead>
                <TableHead>Reason</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(receives ?? []).length === 0 ? (
                <TableEmptyRow colSpan={5} message="No receives logged this month." />
              ) : (
                (receives ?? []).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.createdAt
                        ? receivedAtFormatter.format(new Date(row.createdAt))
                        : "—"}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {row.productName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      +{row.quantityDelta ?? 0}
                    </TableCell>
                    <TableCell>{row.createdByName ?? "—"}</TableCell>
                    <TableCell className="max-w-[14rem] truncate text-muted-foreground">
                      {row.reason ?? "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <Dialog open={receiveOpen} onOpenChange={(open) => !open && setReceiveOpen(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Receive stock</DialogTitle>
            <DialogDescription>
              Increases on-hand quantity and writes a dated receive row to the stock ledger.
            </DialogDescription>
          </DialogHeader>
          <form key={receiveProductId || "new"} onSubmit={onReceiveSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="receive-product">Product</Label>
              <Select value={receiveProductId} onValueChange={setReceiveProductId}>
                <SelectTrigger id="receive-product" className="w-full">
                  <SelectValue placeholder="Pick a product" />
                </SelectTrigger>
                <SelectContent>
                  {(health?.items ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name} ({item.stock} on hand)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receive-location">Branch</Label>
              <Select
                value={receiveLocationId || hubLocationId || undefined}
                onValueChange={setReceiveLocationId}
              >
                <SelectTrigger id="receive-location" className="w-full">
                  <SelectValue placeholder="Harare (hub)" />
                </SelectTrigger>
                <SelectContent>
                  {locations.map((loc) => (
                    <SelectItem key={loc.id} value={loc.id}>
                      {loc.isHub ? `${loc.name} (hub)` : loc.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="receive-qty">Quantity</Label>
                <Input
                  id="receive-qty"
                  name="quantity"
                  type="number"
                  min="1"
                  step="1"
                  defaultValue={1}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="receive-date">Received at</Label>
                <Input
                  id="receive-date"
                  name="receivedAt"
                  type="datetime-local"
                  defaultValue={nowLocalDateTimeInput()}
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="receive-reason">Reason</Label>
              <Textarea
                id="receive-reason"
                name="reason"
                rows={2}
                required
                placeholder="Supplier delivery, restock from warehouse…"
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setReceiveOpen(false)}
                disabled={receiveMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={!receiveProductId || receiveMutation.isPending}>
                {receiveMutation.isPending ? "Receiving…" : "Receive stock"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <TransfersPanel products={health?.items ?? []} />
    </>
  );
}
