"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MinusIcon, PlusIcon, ReceiptTextIcon, Trash2Icon } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { formatMoney, priceReceipt } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";

import {
  fetchDistributorsAction,
  fetchSellableProductsAction,
  recordSaleReceiptAction,
} from "./actions";

export function SellForm({ initialProducts }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // cart: [{ productId, quantity }]
  const [cart, setCart] = useState([]);
  const [clientOpen, setClientOpen] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [lastSaleId, setLastSaleId] = useState(null);

  const { data: products } = useQuery({
    queryKey: queryKeys.sellableProducts,
    queryFn: fetchSellableProductsAction,
    initialData: initialProducts,
  });

  const { data: distributors = [] } = useQuery({
    queryKey: queryKeys.distributors,
    queryFn: fetchDistributorsAction,
    enabled: clientOpen,
  });

  const filteredDistributors = useMemo(() => {
    const q = clientPhone.replace(/\D/g, "");
    if (q.length < 3) return distributors.slice(0, 8);
    return distributors
      .filter((d) => String(d.phone ?? "").includes(q) || (d.name ?? "").toLowerCase().includes(clientName.toLowerCase()))
      .slice(0, 8);
  }, [distributors, clientPhone, clientName]);

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

  const byCategory = useMemo(() => {
    const groups = new Map();
    for (const product of products ?? []) {
      const key = product.categoryId ?? "";
      if (!groups.has(key)) {
        groups.set(key, {
          categoryId: key,
          categoryName: product.categoryName ?? "Category",
          products: [],
        });
      }
      groups.get(key).products.push(product);
    }
    return [...groups.values()].sort((a, b) =>
      a.categoryName.localeCompare(b.categoryName),
    );
  }, [products]);

  const preview = useMemo(() => {
    if (cart.length === 0) return null;
    const priced = priceReceipt(cart, productsById, categoriesById);
    return priced.ok ? priced : null;
  }, [cart, productsById, categoriesById]);

  function addProduct(product) {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: line.quantity + 1 }
            : line,
        );
      }
      return [...current, { productId: product.id, quantity: 1 }];
    });
  }

  function setLineQty(productId, quantity) {
    const qty = Math.max(1, Number(quantity) || 1);
    setCart((current) =>
      current.map((line) => (line.productId === productId ? { ...line, quantity: qty } : line)),
    );
  }

  function bumpLine(productId, delta) {
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          return { ...line, quantity: Math.max(1, line.quantity + delta) };
        })
        .filter((line) => line.quantity >= 1),
    );
  }

  function removeLine(productId) {
    setCart((current) => current.filter((line) => line.productId !== productId));
  }

  const saleMutation = useMutation({
    mutationFn: (client) => recordSaleReceiptAction(cart, client),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        await queryClient.invalidateQueries({ queryKey: queryKeys.sellableProducts });
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sellableProducts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mySales }),
        queryClient.invalidateQueries({ queryKey: queryKeys.distributors }),
      ]);
      router.refresh();
      toast.success(
        `Sale recorded — ${formatMoney(res.totalCents)}${res.wholesale ? " (includes wholesale pack)" : ""}.`,
        {
          action: res.saleId
            ? {
                label: "Open invoice",
                onClick: () => {
                  window.open(`/dashboard/sales/${res.saleId}/invoice`, "_blank", "noopener,noreferrer");
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
      setLastSaleId(res.saleId ?? null);
    },
    onError: () => toast.error("Could not record that sale. Try again."),
  });

  function onConfirm() {
    if (cart.length === 0) {
      toast.error("Add at least one product to the receipt.");
      return;
    }
    if (preview?.wholesale) {
      setClientOpen(true);
      return;
    }
    saleMutation.mutate(null);
  }

  function onClientContinue() {
    const name = clientName.trim();
    const phone = clientPhone.trim();
    if (!name) {
      toast.error("Client name is required for wholesale packs.");
      return;
    }
    if (!phone) {
      toast.error("Client phone is required for wholesale packs.");
      return;
    }
    saleMutation.mutate({ name, phone });
  }

  function pickDistributor(d) {
    setClientName(d.name ?? "");
    setClientPhone(d.phone ?? "");
  }

  return (
    <>
      <Button size="lg" className="h-12 text-base" onClick={() => setOpen(true)}>
        <ReceiptTextIcon className="size-5" />
        Record sale
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex max-h-[92vh] w-full max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl"
          showCloseButton
        >
          <DialogHeader className="border-b border-border px-4 py-3 sm:px-5">
            <DialogTitle>Receipt</DialogTitle>
            <DialogDescription>
              Pick products by category, set quantities, then confirm. Complete category packs
              (e.g. 20 @ $80) apply automatically; leftovers stay retail.
            </DialogDescription>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 gap-0 overflow-hidden md:grid-cols-2">
            <div className="min-h-0 overflow-y-auto border-b border-border p-4 md:border-r md:border-b-0 sm:p-5">
              <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                Products
              </p>
              {byCategory.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nothing in stock with a category — ask your admin to restock or assign
                  categories.
                </p>
              ) : (
                <div className="grid gap-5">
                  {byCategory.map((group) => (
                    <div key={group.categoryId} className="grid gap-2">
                      <div className="flex items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {group.categoryName}
                        </h3>
                        {(group.products[0]?.wholesalePackQty ?? 0) > 0 ? (
                          <span className="text-xs text-muted-foreground tabular-nums">
                            Pack {group.products[0].wholesalePackQty} @{" "}
                            {formatMoney(group.products[0].wholesalePackPriceCents ?? 0)}
                          </span>
                        ) : null}
                      </div>
                      <div className="grid gap-1.5">
                        {group.products.map((product) => (
                          <Button
                            key={product.id}
                            type="button"
                            variant="outline"
                            className="h-11 justify-between px-3 text-left text-base font-normal md:text-sm"
                            disabled={saleMutation.isPending}
                            onClick={() => addProduct(product)}
                          >
                            <span className="truncate">{product.name}</span>
                            <span className="shrink-0 text-muted-foreground tabular-nums">
                              {formatMoney(product.retailPriceCents)}
                            </span>
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden bg-secondary/30">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <p className="mb-3 text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  This sale
                </p>

                {lastSaleId ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-3 text-sm">
                    <span className="text-muted-foreground">Last sale ready to share.</span>
                    <Button
                      type="button"
                      size="sm"
                      render={<a href={`/dashboard/sales/${lastSaleId}/invoice`} target="_blank" rel="noreferrer" />}
                    >
                      Open invoice
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setLastSaleId(null)}>
                      Dismiss
                    </Button>
                  </div>
                ) : null}

                {cart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Tap products on the left to build the receipt.
                  </p>
                ) : (
                  <div className="grid gap-4">
                    {cart.map((line) => {
                      const product = productsById.get(line.productId);
                      return (
                        <div
                          key={line.productId}
                          className="grid gap-2 rounded-lg border border-border bg-card p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {product?.name ?? "Product"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {product?.categoryName ?? "—"}
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Remove ${product?.name ?? "product"}`}
                              disabled={saleMutation.isPending}
                              onClick={() => removeLine(line.productId)}
                            >
                              <Trash2Icon className="size-4 text-destructive" />
                            </Button>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-10 shrink-0"
                              aria-label="Decrease quantity"
                              disabled={saleMutation.isPending || line.quantity <= 1}
                              onClick={() => bumpLine(line.productId, -1)}
                            >
                              <MinusIcon className="size-4" />
                            </Button>
                            <input
                              type="number"
                              min={1}
                              step={1}
                              className="h-10 w-full min-w-0 rounded-lg border border-input bg-background text-center text-lg font-medium tabular-nums"
                              value={line.quantity}
                              disabled={saleMutation.isPending}
                              onChange={(event) =>
                                setLineQty(line.productId, event.target.value)
                              }
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="size-10 shrink-0"
                              aria-label="Increase quantity"
                              disabled={saleMutation.isPending}
                              onClick={() => bumpLine(line.productId, 1)}
                            >
                              <PlusIcon className="size-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}

                    {preview ? (
                      <div className="grid gap-3 rounded-lg border border-border bg-card p-3 text-sm">
                        {preview.packs.map((pack) => (
                          <div key={pack.categoryId} className="grid gap-1.5">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <StatusPill tone="info">Wholesale pack</StatusPill>
                                <span className="truncate font-medium">
                                  {pack.categoryName} ×{pack.packCount}
                                </span>
                              </div>
                              <span className="shrink-0 font-medium tabular-nums">
                                {formatMoney(pack.totalCents)}
                              </span>
                            </div>
                            <ul className="space-y-0.5 pl-1 text-xs text-muted-foreground">
                              {pack.contributions.map((c) => (
                                <li key={c.productId}>
                                  {c.productName} ×{c.quantity}
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}

                        {preview.retailLines.map((line) => (
                          <div
                            key={`retail-${line.productId}`}
                            className="flex items-center justify-between gap-2"
                          >
                            <div className="min-w-0">
                              <p className="truncate">
                                {line.productName} ×{line.quantity}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatMoney(line.unitPriceCents)} each · retail
                              </p>
                            </div>
                            <span className="shrink-0 tabular-nums">
                              {formatMoney(line.lineTotalCents)}
                            </span>
                          </div>
                        ))}

                        <div className="flex items-center justify-between border-t border-border pt-2 text-base">
                          <span className="font-medium">Total</span>
                          <span className="font-semibold tabular-nums">
                            {formatMoney(preview.totalCents)}
                          </span>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

              <DialogFooter className="gap-2 border-t border-border bg-card p-4 sm:flex-row sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="h-11"
                  disabled={saleMutation.isPending || cart.length === 0}
                  onClick={() => setCart([])}
                >
                  Clear
                </Button>
                <Button
                  type="button"
                  size="lg"
                  className="h-11 min-w-40 text-base"
                  disabled={saleMutation.isPending || cart.length === 0}
                  onClick={onConfirm}
                >
                  {saleMutation.isPending
                    ? "Recording…"
                    : preview
                      ? `Confirm · ${formatMoney(preview.totalCents)}`
                      : "Confirm sale"}
                </Button>
              </DialogFooter>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={clientOpen} onOpenChange={setClientOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Wholesale client</DialogTitle>
            <DialogDescription>
              This receipt includes a wholesale pack. Capture the client for your distributor
              network — required before confirming.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="client-name">Name</Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Distributor name"
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-phone">Phone</Label>
              <Input
                id="client-phone"
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="e.g. +263…"
                autoComplete="tel"
              />
            </div>
            {filteredDistributors.length > 0 ? (
              <div className="grid gap-1">
                <p className="text-xs text-muted-foreground">Existing distributors</p>
                <div className="max-h-36 overflow-y-auto rounded-lg border border-border">
                  {filteredDistributors.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      className="flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-sm last:border-b-0 hover:bg-muted"
                      onClick={() => pickDistributor(d)}
                    >
                      <span className="truncate font-medium">{d.name}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">{d.phone}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setClientOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={saleMutation.isPending}
              onClick={onClientContinue}
            >
              {saleMutation.isPending ? "Recording…" : "Confirm sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
