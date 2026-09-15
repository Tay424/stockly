"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeftIcon, PackagePlusIcon } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { TableEmptyRow } from "@/components/table-toolbar";
import { Button } from "@/components/ui/button";
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
import { queryKeys } from "@/lib/query-keys";
import { TRANSFER_STATUS } from "@/lib/stock-ledger";

import {
  cancelTransferAction,
  confirmTransferAction,
  fetchMyBranchAction,
  fetchMyBranchStockAction,
  fetchMyReceivesAction,
  fetchReceiveProductsAction,
  fetchTransfersAction,
  receiveStockAsAttendantAction,
  sendTransferAction,
} from "./actions";

const receivedAtFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

function nowLocalDateTimeInput() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function AttendantInventoryView({
  initialProducts,
  initialReceives,
  initialBranch = null,
  initialBranchStock = [],
}) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [receivedAt, setReceivedAt] = useState(nowLocalDateTimeInput);
  const [transferProductId, setTransferProductId] = useState("");
  const [stockFilter, setStockFilter] = useState("");

  const { data: branchResult } = useQuery({
    queryKey: [...queryKeys.locations, "mine"],
    queryFn: fetchMyBranchAction,
    initialData: initialBranch ? { location: initialBranch } : undefined,
  });

  const location = branchResult?.location ?? null;
  const branchError = branchResult?.error ?? (!location ? "No branch assigned." : null);

  const { data: products } = useQuery({
    queryKey: queryKeys.products,
    queryFn: fetchReceiveProductsAction,
    initialData: initialProducts,
    enabled: Boolean(location),
  });

  const branchStockKey = [...queryKeys.locationStock, location?.id ?? "none"];

  const { data: branchStock } = useQuery({
    queryKey: branchStockKey,
    queryFn: fetchMyBranchStockAction,
    initialData: initialBranchStock,
    enabled: Boolean(location),
  });

  const filteredBranchStock = useMemo(() => {
    const rows = branchStock ?? [];
    const q = stockFilter.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      String(row.productName ?? "")
        .toLowerCase()
        .includes(q),
    );
  }, [branchStock, stockFilter]);

  async function invalidateBranchStockQueries() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.locationStock }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products }),
    ]);
  }


  const { data: receives } = useQuery({
    queryKey: queryKeys.myStockReceives,
    queryFn: fetchMyReceivesAction,
    initialData: initialReceives,
    enabled: Boolean(location),
  });

  const { data: transferData } = useQuery({
    queryKey: queryKeys.myStockTransfers,
    queryFn: fetchTransfersAction,
    enabled: Boolean(location),
  });

  const openIncoming = transferData?.openIncoming ?? [];
  const transfers = transferData?.transfers ?? [];
  const isHub = Boolean(location?.isHub);

  const receiveMutation = useMutation({
    mutationFn: (formData) => receiveStockAsAttendantAction(formData),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        invalidateBranchStockQueries(),
        queryClient.invalidateQueries({ queryKey: queryKeys.myStockReceives }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventoryHealth }),
      ]);
      toast.success(`Stock received. On hand is now ${res.stock}.`);
      setProductId("");
      setReceivedAt(nowLocalDateTimeInput());
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const sendMutation = useMutation({
    mutationFn: (formData) => sendTransferAction(formData),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        invalidateBranchStockQueries(),
        queryClient.invalidateQueries({ queryKey: queryKeys.myStockTransfers }),
      ]);
      toast.success("Transfer sent to Gweru — awaiting confirmation.");
      setTransferProductId("");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const confirmMutation = useMutation({
    mutationFn: (id) => confirmTransferAction(id),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        invalidateBranchStockQueries(),
        queryClient.invalidateQueries({ queryKey: queryKeys.myStockTransfers }),
      ]);
      toast.success("Incoming transfer confirmed.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelTransferAction(id, "Cancelled by hub attendant"),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        invalidateBranchStockQueries(),
        queryClient.invalidateQueries({ queryKey: queryKeys.myStockTransfers }),
      ]);
      toast.success("Transfer cancelled.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  function onReceiveSubmit(event) {
    event.preventDefault();
    if (!productId) {
      toast.error("Pick a product.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("productId", productId);
    formData.set("receivedAt", receivedAt);
    receiveMutation.mutate(formData);
  }

  function onSendTransfer(event) {
    event.preventDefault();
    if (!transferProductId) {
      toast.error("Pick a product to send.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("productId", transferProductId);
    sendMutation.mutate(formData);
  }

  if (!location) {
    return (
      <div className="rounded-lg border border-border bg-card px-4 py-8 text-center">
        <p className="text-sm font-medium text-foreground">No branch assigned</p>
        <p className="mt-1 text-sm text-muted-foreground">
          {branchError ||
            "Ask an admin to assign you to Harare or Gweru on Users before receiving stock or confirming transfers."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-card px-4 py-3">
        <p className="text-sm text-foreground">
          Your branch: <span className="font-medium">{location.name}</span>
          {isHub ? " (hub)" : ""}
        </p>
        <p className="text-xs text-muted-foreground">
          Receives update stock at this branch only.
          {isHub
            ? " You can send stock to Gweru."
            : " Confirm incoming transfers from Harare here."}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h2 className="text-sm font-medium text-foreground">Stock on hand</h2>
            <p className="text-xs text-muted-foreground">
              {location.name} only — ask an admin to amend counts.
            </p>
          </div>
          <Input
            value={stockFilter}
            onChange={(event) => setStockFilter(event.target.value)}
            placeholder="Search products…"
            className="h-8 w-full max-w-xs"
            aria-label="Search branch stock"
          />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredBranchStock.length === 0 ? (
                <TableEmptyRow
                  colSpan={2}
                  message={
                    stockFilter.trim()
                      ? "No products match that search."
                      : "No stock recorded at this branch yet."
                  }
                />
              ) : (
                filteredBranchStock.map((row) => (
                  <TableRow key={row.productId}>
                    <TableCell className="font-medium text-foreground">
                      {row.productName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
        <form
          onSubmit={onReceiveSubmit}
          className="grid h-fit gap-4 rounded-lg border border-border bg-card p-4"
        >
          <div className="flex items-center gap-2">
            <PackagePlusIcon className="size-4 text-primary" />
            <h2 className="text-sm font-medium text-foreground">Receive stock</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            Updates {location.name} on-hand immediately. Use the time the delivery actually arrived.
          </p>

          <div className="grid gap-2">
            <Label htmlFor="att-receive-product">Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger id="att-receive-product" className="w-full">
                <SelectValue placeholder="Pick a product" />
              </SelectTrigger>
              <SelectContent>
                {(products ?? []).map((item) => (
                  <SelectItem key={item.id} value={item.id}>
                    {item.name} ({item.stock} on hand)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="att-receive-qty">Quantity</Label>
            <Input
              id="att-receive-qty"
              name="quantity"
              type="number"
              min="1"
              step="1"
              defaultValue={1}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="att-receive-at">Received at</Label>
            <Input
              id="att-receive-at"
              name="receivedAt"
              type="datetime-local"
              value={receivedAt}
              onChange={(event) => setReceivedAt(event.target.value)}
              required
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="att-receive-reason">Reason</Label>
            <Textarea
              id="att-receive-reason"
              name="reason"
              rows={2}
              required
              placeholder="Supplier delivery, restock from warehouse…"
            />
          </div>

          <Button type="submit" disabled={!productId || receiveMutation.isPending}>
            {receiveMutation.isPending ? "Receiving…" : `Receive into ${location.name}`}
          </Button>
        </form>

        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">Your recent receives</h2>
            <p className="text-xs text-muted-foreground">
              Entries you logged — also visible to admins on Inventory.
            </p>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>When</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(receives ?? []).length === 0 ? (
                  <TableEmptyRow colSpan={4} message="No receives logged yet." />
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
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ArrowRightLeftIcon className="size-4 text-primary" />
          <div>
            <h2 className="text-sm font-medium text-foreground">Branch transfers</h2>
            <p className="text-xs text-muted-foreground">
              {isHub
                ? "Send stock to Gweru (moves into In transit until they confirm)."
                : "Confirm stock arriving from Harare into Gweru."}
            </p>
          </div>
        </div>

        {isHub ? (
          <form
            onSubmit={onSendTransfer}
            className="grid gap-3 border-b border-border p-4 sm:grid-cols-[1fr_6rem_1fr_auto]"
          >
            <div className="grid gap-1.5">
              <Label>Product</Label>
              <Select value={transferProductId} onValueChange={setTransferProductId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pick a product" />
                </SelectTrigger>
                <SelectContent>
                  {(products ?? []).map((item) => (
                    <SelectItem key={item.id} value={item.id}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="send-qty">Qty</Label>
              <Input id="send-qty" name="quantity" type="number" min="1" defaultValue={1} required />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="send-reason">Note</Label>
              <Input id="send-reason" name="reason" placeholder="Optional" />
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={!transferProductId || sendMutation.isPending}>
                {sendMutation.isPending ? "Sending…" : "Send to Gweru"}
              </Button>
            </div>
          </form>
        ) : null}

        {!isHub ? (
          <div className="border-b border-border">
            <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Incoming ({openIncoming.length})
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openIncoming.length === 0 ? (
                  <TableEmptyRow colSpan={4} message="No incoming transfers waiting." />
                ) : (
                  openIncoming.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-medium">{row.productName}</TableCell>
                      <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {row.fromLocationName}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          disabled={confirmMutation.isPending}
                          onClick={() => confirmMutation.mutate(row.id)}
                        >
                          Confirm arrival
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        ) : (
          <div className="border-b border-border">
            <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              In transit
            </div>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {openIncoming.length === 0 &&
                transfers.filter((t) => t.status === TRANSFER_STATUS.inTransit).length === 0 ? (
                  <TableEmptyRow colSpan={4} message="Nothing in transit." />
                ) : (
                  transfers
                    .filter((t) => t.status === TRANSFER_STATUS.inTransit)
                    .map((row) => (
                      <TableRow key={row.id}>
                        <TableCell className="font-medium">{row.productName}</TableCell>
                        <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {row.toLocationName}
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={cancelMutation.isPending}
                            onClick={() => {
                              if (window.confirm("Cancel this transfer?")) {
                                cancelMutation.mutate(row.id);
                              }
                            }}
                          >
                            Cancel
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        <div className="px-4 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Transfer history
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Product</TableHead>
              <TableHead>Route</TableHead>
              <TableHead className="text-right">Qty</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {transfers.length === 0 ? (
              <TableEmptyRow colSpan={4} message="No transfers yet." />
            ) : (
              transfers.slice(0, 15).map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.productName}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {row.fromLocationName} → {row.toLocationName}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                  <TableCell>
                    <StatusPill
                      tone={
                        row.status === TRANSFER_STATUS.inTransit
                          ? "warning"
                          : row.status === TRANSFER_STATUS.completed
                            ? "success"
                            : "muted"
                      }
                    >
                      {row.status === TRANSFER_STATUS.inTransit
                        ? "In transit"
                        : row.status === TRANSFER_STATUS.completed
                          ? "Completed"
                          : "Cancelled"}
                    </StatusPill>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
