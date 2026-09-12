"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MinusIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

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
import { formatMoney, priceReceipt } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import {
  BACKFILL_EARLIEST_LOCAL,
  toDatetimeLocalValue,
} from "@/lib/sales-backfill";

import {
  fetchBackfillDistributorsAction,
  fetchBackfillProductsAction,
  recordPastSaleAction,
} from "./backfill-actions";

export function BackfillSaleForm({ initialProducts }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [soldAtLocal, setSoldAtLocal] = useState(() => toDatetimeLocalValue(new Date()));
  const [productId, setProductId] = useState("");
  const [qtyDraft, setQtyDraft] = useState("1");
  const [cart, setCart] = useState([]);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");

  const { data: products } = useQuery({
    queryKey: queryKeys.sellableProducts,
    queryFn: fetchBackfillProductsAction,
    initialData: initialProducts,
  });

  const { data: distributors = [] } = useQuery({
    queryKey: queryKeys.distributors,
    queryFn: fetchBackfillDistributorsAction,
    enabled: clientOpen,
  });

  const productsById = useMemo(() => {
    const map = new Map();
    for (const product of products ?? []) map.set(product.id, product);
    return map;
  }, [products]);

  const categoriesById = useMemo(() => {
    const map = new Map();
    for (const product of products ?? []) {
      if (!product.categoryId || map.has(product.categoryId)) continue;
      map.set(product.categoryId, {
        id: product.categoryId,
        name: product.categoryName ?? "Category",
        wholesalePackQty: product.wholesalePackQty ?? 0,
        wholesalePackPriceCents: product.wholesalePackPriceCents ?? 0,
      });
    }
    return map;
  }, [products]);

  const productItems = useMemo(
    () =>
      (products ?? []).map((p) => ({
        value: p.id,
        label: `${p.name} · ${formatMoney(p.retailPriceCents)} · stock ${p.stock}`,
      })),
    [products],
  );

  const preview = useMemo(() => {
    if (cart.length === 0) return null;
    const priced = priceReceipt(cart, productsById, categoriesById);
    return priced.ok ? priced : null;
  }, [cart, productsById, categoriesById]);

  const filteredDistributors = useMemo(() => {
    const q = clientPhone.replace(/\D/g, "");
    if (q.length < 3) return distributors.slice(0, 8);
    return distributors
      .filter(
        (d) =>
          String(d.phone ?? "").includes(q) ||
          (d.name ?? "").toLowerCase().includes(clientName.toLowerCase()),
      )
      .slice(0, 8);
  }, [distributors, clientPhone, clientName]);

  const minSoldAt = toDatetimeLocalValue(BACKFILL_EARLIEST_LOCAL);
  const maxSoldAt = toDatetimeLocalValue(new Date());

  function addToCart() {
    if (!productId) {
      toast.error("Choose a product.");
      return;
    }
    const quantity = Math.max(1, Number.parseInt(qtyDraft, 10) || 1);
    setCart((current) => {
      const existing = current.find((line) => line.productId === productId);
      if (existing) {
        return current.map((line) =>
          line.productId === productId
            ? { ...line, quantity: line.quantity + quantity }
            : line,
        );
      }
      return [...current, { productId, quantity }];
    });
    setQtyDraft("1");
  }

  function bumpLine(id, delta) {
    setCart((current) =>
      current
        .map((line) =>
          line.productId === id
            ? { ...line, quantity: Math.max(1, line.quantity + delta) }
            : line,
        )
        .filter((line) => line.quantity >= 1),
    );
  }

  function removeLine(id) {
    setCart((current) => current.filter((line) => line.productId !== id));
  }

  const mutation = useMutation({
    mutationFn: ({ client, soldAt }) => recordPastSaleAction(cart, client, soldAt),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        await queryClient.invalidateQueries({ queryKey: queryKeys.sellableProducts });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sellableProducts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sales }),
        queryClient.invalidateQueries({ queryKey: queryKeys.distributors }),
      ]);
      router.refresh();
      toast.success(
        `Past sale recorded — ${formatMoney(res.totalCents)}${
          res.wholesale ? " (includes wholesale pack)" : ""
        }.`,
        {
          action: res.saleId
            ? {
                label: "Open invoice",
                onClick: () => {
                  window.open(
                    `/dashboard/sales/${res.saleId}/invoice`,
                    "_blank",
                    "noopener,noreferrer",
                  );
                },
              }
            : undefined,
          duration: 8000,
        },
      );
      setCart([]);
      setClientOpen(false);
      setClientName("");
      setClientPhone("");
      setSoldAtLocal(toDatetimeLocalValue(new Date()));
    },
    onError: () => toast.error("Could not record that past sale. Try again."),
  });

  function onRecord() {
    if (cart.length === 0) {
      toast.error("Add at least one product.");
      return;
    }
    if (!soldAtLocal) {
      toast.error("Choose when the sale happened.");
      return;
    }
    setClientName("");
    setClientPhone("");
    setClientOpen(true);
  }

  function submitClient(client) {
    mutation.mutate({ client, soldAt: soldAtLocal });
  }

  function onClientContinue() {
    const name = clientName.trim();
    const phone = clientPhone.trim();
    const wholesale = Boolean(preview?.wholesale);

    if (wholesale) {
      if (!name) {
        toast.error("Client name is required for wholesale packs.");
        return;
      }
      if (!phone) {
        toast.error("Client phone is required for wholesale packs.");
        return;
      }
      submitClient({ name, phone });
      return;
    }

    if (!name && !phone) {
      submitClient(null);
      return;
    }
    if (!name && phone) {
      toast.error("Add a customer name when saving a phone number.");
      return;
    }
    submitClient({ name, phone: phone || undefined });
  }

  function onClientSkip() {
    if (preview?.wholesale) {
      toast.error("Client name and phone are required for wholesale packs.");
      return;
    }
    submitClient(null);
  }

  return (
    <div className="grid gap-6">
      <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
        Deducts <strong>current</strong> on-hand stock. Use only for paper sales from{" "}
        <strong>22 July 2026</strong> onward that are not already in the app.
      </div>

      <div className="grid gap-2 sm:max-w-sm">
        <Label htmlFor="sold-at">Sold at</Label>
        <Input
          id="sold-at"
          type="datetime-local"
          value={soldAtLocal}
          min={minSoldAt}
          max={maxSoldAt}
          onChange={(e) => setSoldAtLocal(e.target.value)}
          required
        />
        <p className="text-xs text-muted-foreground">
          Date and time the sale actually happened (local time).
        </p>
      </div>

      <div className="grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_6rem_auto] sm:items-end">
        <div className="grid gap-2">
          <Label>Product</Label>
          <Select value={productId || undefined} onValueChange={setProductId} items={productItems}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Choose product" />
            </SelectTrigger>
            <SelectContent>
              {productItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="backfill-qty">Qty</Label>
          <Input
            id="backfill-qty"
            type="number"
            min={1}
            step={1}
            value={qtyDraft}
            onChange={(e) => setQtyDraft(e.target.value)}
          />
        </div>
        <Button type="button" onClick={addToCart} disabled={mutation.isPending}>
          Add to receipt
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium text-foreground">Receipt</h2>
        </div>
        {cart.length === 0 ? (
          <p className="px-4 py-8 text-sm text-muted-foreground">No lines yet.</p>
        ) : (
          <ul className="divide-y divide-border">
            {cart.map((line) => {
              const product = productsById.get(line.productId);
              return (
                <li
                  key={line.productId}
                  className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
                >
                  <div>
                    <p className="font-medium text-foreground">
                      {product?.name ?? "Product"}
                    </p>
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {formatMoney(product?.retailPriceCents ?? 0)} each · stock{" "}
                      {product?.stock ?? "—"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={() => bumpLine(line.productId, -1)}
                      disabled={mutation.isPending}
                      aria-label="Decrease quantity"
                    >
                      <MinusIcon className="size-4" />
                    </Button>
                    <span className="w-8 text-center tabular-nums">{line.quantity}</span>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="outline"
                      onClick={() => bumpLine(line.productId, 1)}
                      disabled={mutation.isPending}
                      aria-label="Increase quantity"
                    >
                      <PlusIcon className="size-4" />
                    </Button>
                    <Button
                      type="button"
                      size="icon-sm"
                      variant="ghost"
                      onClick={() => removeLine(line.productId)}
                      disabled={mutation.isPending}
                      aria-label="Remove line"
                    >
                      <Trash2Icon className="size-4 text-destructive" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-4 py-3">
          <p className="text-sm text-muted-foreground">
            {preview
              ? `${preview.quantity} units${preview.wholesale ? " · includes pack pricing" : ""}`
              : "—"}
          </p>
          <p className="text-lg font-medium tabular-nums text-foreground">
            {preview ? formatMoney(preview.totalCents) : formatMoney(0)}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="lg"
          onClick={onRecord}
          disabled={mutation.isPending || cart.length === 0}
        >
          {mutation.isPending ? "Saving…" : "Record past sale"}
        </Button>
        <Button type="button" size="lg" variant="outline" render={<Link href="/admin/sales" />}>
          Back to sales
        </Button>
      </div>

      <Dialog open={clientOpen} onOpenChange={setClientOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {preview?.wholesale ? "Client details (required)" : "Customer (optional)"}
            </DialogTitle>
            <DialogDescription>
              {preview?.wholesale
                ? "Wholesale packs need a name and phone for the distributor directory."
                : "Optional for retail. Name + phone saves them to distributors."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label htmlFor="backfill-client-name">Name</Label>
              <Input
                id="backfill-client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                autoComplete="off"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="backfill-client-phone">Phone</Label>
              <Input
                id="backfill-client-phone"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                autoComplete="off"
              />
            </div>
            {filteredDistributors.length > 0 ? (
              <div className="grid gap-1">
                <p className="text-xs text-muted-foreground">Matches</p>
                <ul className="max-h-32 overflow-y-auto rounded-md border border-border">
                  {filteredDistributors.map((d) => (
                    <li key={d.id}>
                      <button
                        type="button"
                        className="flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-muted"
                        onClick={() => {
                          setClientName(d.name ?? "");
                          setClientPhone(d.phone ?? "");
                        }}
                      >
                        <span className="font-medium">{d.name}</span>
                        <span className="text-xs text-muted-foreground">{d.phone}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            {!preview?.wholesale ? (
              <Button type="button" variant="outline" onClick={onClientSkip} disabled={mutation.isPending}>
                Skip
              </Button>
            ) : null}
            <Button type="button" onClick={onClientContinue} disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Confirm & save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
