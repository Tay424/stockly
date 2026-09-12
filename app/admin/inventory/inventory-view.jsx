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
import { queryKeys } from "@/lib/query-keys";
import { filterByQuery, filterTriggerClassName } from "@/lib/table-filter";

import {
  fetchInventoryHealthAction,
  fetchMonthInventoryAction,
  receiveStockAction,
} from "./actions";

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

function todayLocalInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function InventoryView({ initialHealth, initialMonth }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [receiveProductId, setReceiveProductId] = useState("");

  const { data: health } = useQuery({
    queryKey: queryKeys.inventoryHealth,
    queryFn: fetchInventoryHealthAction,
    initialData: initialHealth,
  });

  const { data: month } = useQuery({
    queryKey: queryKeys.inventoryMonth,
    queryFn: () => fetchMonthInventoryAction(initialMonth.monthKey),
    initialData: initialMonth,
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
        queryClient.invalidateQueries({ queryKey: queryKeys.products }),
      ]);
      toast.success("Stock received.");
      setReceiveOpen(false);
      setReceiveProductId("");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

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
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
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

      <div className="overflow-hidden rounded-lg border border-border bg-card">
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
                <Label htmlFor="receive-date">Date</Label>
                <Input
                  id="receive-date"
                  name="receivedAt"
                  type="date"
                  defaultValue={todayLocalInput()}
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
    </>
  );
}
