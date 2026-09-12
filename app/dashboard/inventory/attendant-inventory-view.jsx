"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PackagePlusIcon } from "lucide-react";
import { toast } from "sonner";

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

import {
  fetchMyReceivesAction,
  fetchReceiveProductsAction,
  receiveStockAsAttendantAction,
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

export function AttendantInventoryView({ initialProducts, initialReceives }) {
  const queryClient = useQueryClient();
  const [productId, setProductId] = useState("");
  const [receivedAt, setReceivedAt] = useState(nowLocalDateTimeInput);

  const { data: products } = useQuery({
    queryKey: queryKeys.products,
    queryFn: fetchReceiveProductsAction,
    initialData: initialProducts,
  });

  const { data: receives } = useQuery({
    queryKey: queryKeys.myStockReceives,
    queryFn: fetchMyReceivesAction,
    initialData: initialReceives,
  });

  const receiveMutation = useMutation({
    mutationFn: (formData) => receiveStockAsAttendantAction(formData),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.products }),
        queryClient.invalidateQueries({ queryKey: queryKeys.myStockReceives }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventoryHealth }),
        queryClient.invalidateQueries({ queryKey: queryKeys.inventoryMonth }),
      ]);
      toast.success(`Stock received. On hand is now ${res.stock}.`);
      setProductId("");
      setReceivedAt(nowLocalDateTimeInput());
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  function onSubmit(event) {
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,22rem)_1fr]">
      <form
        onSubmit={onSubmit}
        className="grid h-fit gap-4 rounded-lg border border-border bg-card p-4"
      >
        <div className="flex items-center gap-2">
          <PackagePlusIcon className="size-4 text-primary" />
          <h2 className="text-sm font-medium text-foreground">Receive stock</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Shop stock updates immediately. Use the date and time the delivery actually arrived.
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
          {receiveMutation.isPending ? "Receiving…" : "Receive into shop stock"}
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
  );
}
