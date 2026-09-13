"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRightLeftIcon } from "lucide-react";
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
  fetchSellableLocationsAction,
  fetchTransfersAction,
  sendTransferAction,
} from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const STATUS_TONE = {
  [TRANSFER_STATUS.inTransit]: "warning",
  [TRANSFER_STATUS.completed]: "success",
  [TRANSFER_STATUS.cancelled]: "muted",
};

const STATUS_LABEL = {
  [TRANSFER_STATUS.inTransit]: "In transit",
  [TRANSFER_STATUS.completed]: "Completed",
  [TRANSFER_STATUS.cancelled]: "Cancelled",
};

export function TransfersPanel({ products = [] }) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [fromLocationId, setFromLocationId] = useState("");
  const [toLocationId, setToLocationId] = useState("");

  const { data: locations = [] } = useQuery({
    queryKey: queryKeys.locations,
    queryFn: fetchSellableLocationsAction,
  });

  const { data: transfers = [] } = useQuery({
    queryKey: queryKeys.stockTransfers,
    queryFn: () => fetchTransfersAction({}),
  });

  const hub = useMemo(() => locations.find((l) => l.isHub), [locations]);
  const branch = useMemo(() => locations.find((l) => !l.isHub), [locations]);

  const pending = useMemo(
    () => transfers.filter((t) => t.status === TRANSFER_STATUS.inTransit),
    [transfers],
  );

  const sendMutation = useMutation({
    mutationFn: (formData) => sendTransferAction(formData),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.stockTransfers });
      await queryClient.invalidateQueries({ queryKey: queryKeys.inventoryHealth });
      toast.success("Transfer sent — stock is in transit.");
      setProductId("");
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
      await queryClient.invalidateQueries({ queryKey: queryKeys.stockTransfers });
      await queryClient.invalidateQueries({ queryKey: queryKeys.inventoryHealth });
      toast.success("Transfer confirmed at destination.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const cancelMutation = useMutation({
    mutationFn: (id) => cancelTransferAction(id, "Cancelled by admin"),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await queryClient.invalidateQueries({ queryKey: queryKeys.stockTransfers });
      await queryClient.invalidateQueries({ queryKey: queryKeys.inventoryHealth });
      toast.success("Transfer cancelled — stock returned to source.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  function onSend(event) {
    event.preventDefault();
    if (!productId) {
      toast.error("Pick a product.");
      return;
    }
    const fromId = fromLocationId || hub?.id;
    const toId = toLocationId || branch?.id;
    if (!fromId || !toId) {
      toast.error("Choose source and destination branches.");
      return;
    }
    const formData = new FormData(event.currentTarget);
    formData.set("productId", productId);
    formData.set("fromLocationId", fromId);
    formData.set("toLocationId", toId);
    sendMutation.mutate(formData);
  }

  return (
    <div className="mt-6 space-y-4">
      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <ArrowRightLeftIcon className="size-4 text-primary" />
          <div>
            <h2 className="text-sm font-medium text-foreground">Transfers</h2>
            <p className="text-xs text-muted-foreground">
              Send Harare → Gweru via In transit. Confirm on arrival or cancel to return stock.
            </p>
          </div>
        </div>

        <form onSubmit={onSend} className="grid gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-6">
          <div className="grid gap-1.5 lg:col-span-2">
            <Label>Product</Label>
            <Select value={productId} onValueChange={setProductId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="transfer-qty">Qty</Label>
            <Input id="transfer-qty" name="quantity" type="number" min="1" step="1" defaultValue={1} required />
          </div>
          <div className="grid gap-1.5">
            <Label>From</Label>
            <Select
              value={fromLocationId || hub?.id || ""}
              onValueChange={setFromLocationId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="From" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>To</Label>
            <Select
              value={toLocationId || branch?.id || ""}
              onValueChange={setToLocationId}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="To" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((loc) => (
                  <SelectItem key={loc.id} value={loc.id}>
                    {loc.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5 sm:col-span-2 lg:col-span-6">
            <Label htmlFor="transfer-reason">Note (optional)</Label>
            <Textarea id="transfer-reason" name="reason" rows={1} placeholder="Weekly restock…" />
          </div>
          <div className="flex items-end lg:col-span-6">
            <Button type="submit" disabled={!productId || sendMutation.isPending}>
              {sendMutation.isPending ? "Sending…" : "Send transfer"}
            </Button>
          </div>
        </form>

        <div className="border-b border-border px-4 py-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Pending in transit ({pending.length})
          </h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Sent</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.length === 0 ? (
                <TableEmptyRow colSpan={5} message="No stock in transit." />
              ) : (
                pending.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.fromLocationName} → {row.toLocationName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.sentAt ? dateFormatter.format(new Date(row.sentAt)) : "—"}
                      {row.sentByName ? ` · ${row.sentByName}` : ""}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={confirmMutation.isPending}
                          onClick={() => confirmMutation.mutate(row.id)}
                        >
                          Confirm
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={cancelMutation.isPending}
                          onClick={() => {
                            if (window.confirm("Cancel this transfer and return stock to source?")) {
                              cancelMutation.mutate(row.id);
                            }
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="border-b border-border px-4 py-2">
          <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Recent history
          </h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead>Route</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {transfers.length === 0 ? (
                <TableEmptyRow colSpan={5} message="No transfers yet." />
              ) : (
                transfers.slice(0, 20).map((row) => (
                  <TableRow key={row.id}>
                    <TableCell className="font-medium">{row.productName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.fromLocationName} → {row.toLocationName}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{row.quantity}</TableCell>
                    <TableCell>
                      <StatusPill tone={STATUS_TONE[row.status] ?? "muted"}>
                        {STATUS_LABEL[row.status] ?? row.status}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {row.sentAt ? dateFormatter.format(new Date(row.sentAt)) : "—"}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
