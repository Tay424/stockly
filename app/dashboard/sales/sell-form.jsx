"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MinusIcon, PackageIcon, PlusIcon, ReceiptTextIcon, Trash2Icon } from "lucide-react";
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
        retailPackQty: product.retailPackQty ?? 0,
        retailPackPriceCents: product.retailPackPriceCents ?? 0,
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
          wholesalePackQty: product.wholesalePackQty ?? 0,
          wholesalePackPriceCents: product.wholesalePackPriceCents ?? 0,
          retailPackQty: product.retailPackQty ?? 0,
          retailPackPriceCents: product.retailPackPriceCents ?? 0,
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
    return priceReceipt(cart, productsById, categoriesById);
  }, [cart, productsById, categoriesById]);

  function packStepFor(productId) {
    const product = productsById.get(productId);
    const step = Number(product?.retailPackQty) || 0;
    return step > 0 ? step : 1;
  }

  function addProduct(product) {
    const step = Number(product.retailPackQty) > 0 ? Number(product.retailPackQty) : 1;
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        return current.map((line) =>
          line.productId === product.id
            ? { ...line, quantity: line.quantity + step }
            : line,
        );
      }
      return [...current, { productId: product.id, quantity: step }];
    });
  }

  function setLineQty(productId, quantity) {
    const step = packStepFor(productId);
    let qty = Math.max(step, Number(quantity) || step);
    if (step > 1) qty = Math.round(qty / step) * step;
    if (qty < step) qty = step;
    setCart((current) =>
      current.map((line) => (line.productId === productId ? { ...line, quantity: qty } : line)),
    );
  }

  function bumpLine(productId, direction) {
    const step = packStepFor(productId);
    const delta = direction * step;
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          return { ...line, quantity: line.quantity + delta };
        })
        .filter((line) => line.quantity >= step),
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
        queryClient.invalidateQueries({ queryKey: queryKeys.distributorPerformance }),
        queryClient.invalidateQueries({ queryKey: queryKeys.sales }),
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

  function openClientDialog() {
    setClientName("");
    setClientPhone("");
    setClientOpen(true);
  }

  function onConfirm() {
    if (cart.length === 0) {
      toast.error("Add at least one product to the receipt.");
      return;
    }
    if (preview && !preview.ok) {
      toast.error(preview.reason || "Fix quantities before recording.");
      return;
    }
    // Always offer client capture: required for wholesale, optional for retail CRM.
    openClientDialog();
  }

  function submitClient(client) {
    saleMutation.mutate(client);
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

    // Retail: empty = skip; name only OK; phone needs a name.
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

  function pickDistributor(d) {
    setClientName(d.name ?? "");
    setClientPhone(d.phone ?? "");
  }

  const wholesaleClient = Boolean(preview?.wholesale);

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
              Tap product photos to add them. Wholesale packs apply first; retail pack
              categories (e.g. 3 @ $10) only sell in those pack sizes.
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
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="text-sm font-semibold text-foreground">
                          {group.categoryName}
                        </h3>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground tabular-nums">
                          {(group.retailPackQty ?? 0) > 0 ? (
                            <span>
                              Pack of {group.retailPackQty} @{" "}
                              {formatMoney(group.retailPackPriceCents ?? 0)}
                            </span>
                          ) : null}
                          {(group.wholesalePackQty ?? 0) > 0 ? (
                            <span>
                              Wholesale {group.wholesalePackQty} @{" "}
                              {formatMoney(group.wholesalePackPriceCents ?? 0)}
                            </span>
                          ) : null}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                        {group.products.map((product) => (
                          <button
                            key={product.id}
                            type="button"
                            disabled={saleMutation.isPending}
                            onClick={() => addProduct(product)}
                            className="group flex flex-col overflow-hidden rounded-lg border border-border bg-card text-left transition-colors hover:border-primary/40 hover:bg-muted/40 disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <div className="relative aspect-square w-full bg-muted">
                              {product.imageUrl ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={product.imageUrl}
                                  alt=""
                                  className="absolute inset-0 size-full object-cover"
                                />
                              ) : (
                                <span className="absolute inset-0 flex flex-col items-center justify-center gap-1 p-2 text-muted-foreground">
                                  <PackageIcon className="size-8 opacity-50" />
                                  <span className="line-clamp-2 text-center text-xs font-medium text-foreground">
                                    {product.name}
                                  </span>
                                </span>
                              )}
                            </div>
                            <div className="grid gap-0.5 p-2">
                              <span className="truncate text-sm font-medium text-foreground">
                                {product.name}
                              </span>
                              <span className="text-xs tabular-nums text-muted-foreground">
                                {product.retailPackQty > 0
                                  ? `Pack of ${product.retailPackQty} · ${formatMoney(product.retailPackPriceCents ?? 0)}`
                                  : formatMoney(product.retailPriceCents)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="flex min-h-0 flex-col overflow-hidden bg-[#f7f1ea]/80">
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="text-xs font-medium tracking-[0.14em] text-muted-foreground uppercase">
                    Receipt
                  </p>
                  {preview?.ok ? (
                    <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground ring-1 ring-border">
                      {formatMoney(preview.totalCents)}
                    </span>
                  ) : null}
                </div>

                {lastSaleId ? (
                  <div className="mb-4 flex flex-wrap items-center gap-2 rounded-2xl border border-[#e8ddd0] bg-[#fffdf9] p-3 text-sm shadow-sm">
                    <span className="text-muted-foreground">Last sale ready to share.</span>
                    <Button
                      type="button"
                      size="sm"
                      className="rounded-full"
                      render={<a href={`/dashboard/sales/${lastSaleId}/invoice`} target="_blank" rel="noreferrer" />}
                    >
                      Open receipt
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setLastSaleId(null)}>
                      Dismiss
                    </Button>
                  </div>
                ) : null}

                {cart.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#e5d7c8] bg-[#fffdf9]/70 px-4 py-8 text-center">
                    <p className="text-sm text-muted-foreground text-balance">
                      Tap products to build the receipt.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-3">
                    {cart.map((line) => {
                      const product = productsById.get(line.productId);
                      const step = packStepFor(line.productId);
                      return (
                        <div
                          key={line.productId}
                          className="grid gap-2 rounded-2xl border border-[#e8ddd0] bg-[#fffdf9] p-3 shadow-sm"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium text-foreground">
                                {product?.name ?? "Product"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {product?.categoryName ?? "—"}
                                {step > 1 ? ` · packs of ${step}` : ""}
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
                              className="size-10 shrink-0 rounded-full"
                              aria-label="Decrease quantity"
                              disabled={saleMutation.isPending || line.quantity <= step}
                              onClick={() => bumpLine(line.productId, -1)}
                            >
                              <MinusIcon className="size-4" />
                            </Button>
                            <input
                              type="number"
                              min={step}
                              step={step}
                              className="h-10 w-full min-w-0 rounded-xl border border-input bg-background text-center text-lg font-medium tabular-nums"
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
                              className="size-10 shrink-0 rounded-full"
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

                    {preview && !preview.ok ? (
                      <div className="rounded-2xl border border-destructive/40 bg-destructive/5 px-3 py-3 text-sm text-destructive">
                        {preview.reason}
                      </div>
                    ) : null}

                    {preview?.ok ? (
                      <div className="grid gap-0 overflow-hidden rounded-2xl border border-[#e8ddd0] bg-[#fffdf9] text-sm shadow-sm">
                        <div className="border-b border-dashed border-[#e5d7c8] px-3 py-2 text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                          Summary
                        </div>
                        <div className="grid gap-3 px-3 py-3">
                          {preview.packs.map((pack) => (
                            <div key={`w-${pack.categoryId}`} className="grid gap-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <StatusPill tone="info">Wholesale</StatusPill>
                                  <span className="truncate font-medium">
                                    {pack.categoryName} ×{pack.packCount}
                                  </span>
                                </div>
                                <span className="shrink-0 font-semibold tabular-nums">
                                  {formatMoney(pack.totalCents)}
                                </span>
                              </div>
                              <ul className="space-y-0.5 text-xs text-muted-foreground">
                                {pack.contributions.map((c) => (
                                  <li key={c.productId}>
                                    {c.productName} ×{c.quantity}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          ))}

                          {(preview.retailPacks ?? []).map((pack) => (
                            <div key={`r-${pack.categoryId}`} className="grid gap-1.5">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex min-w-0 items-center gap-2">
                                  <StatusPill tone="info">Retail pack</StatusPill>
                                  <span className="truncate font-medium">
                                    {pack.categoryName} ×{pack.packCount} (
                                    {pack.packQty} ea)
                                  </span>
                                </div>
                                <span className="shrink-0 font-semibold tabular-nums">
                                  {formatMoney(pack.totalCents)}
                                </span>
                              </div>
                              <ul className="space-y-0.5 text-xs text-muted-foreground">
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
                                <p className="truncate font-medium">
                                  {line.productName} ×{line.quantity}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {formatMoney(line.unitPriceCents)} each · retail
                                </p>
                              </div>
                              <span className="shrink-0 font-semibold tabular-nums">
                                {formatMoney(line.lineTotalCents)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className="flex items-center justify-between bg-primary px-3 py-3 text-primary-foreground">
                          <span className="text-xs font-medium tracking-wide uppercase opacity-80">
                            Total
                          </span>
                          <span className="text-lg font-semibold tabular-nums">
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
                  disabled={
                    saleMutation.isPending || cart.length === 0 || (preview && !preview.ok)
                  }
                  onClick={onConfirm}
                >
                  {saleMutation.isPending
                    ? "Recording…"
                    : preview?.ok
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
            <DialogTitle>
              {wholesaleClient ? "Wholesale client" : "Customer details"}
            </DialogTitle>
            <DialogDescription>
              {wholesaleClient
                ? "This receipt includes a wholesale pack. Capture the client for your distributor network — required before confirming."
                : "Optional — add a name (and phone) for CRM and marketing. Skip if the customer prefers not to share."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="client-name">
                Name{wholesaleClient ? "" : " (optional)"}
              </Label>
              <Input
                id="client-name"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={wholesaleClient ? "Distributor name" : "Customer name"}
                autoComplete="name"
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="client-phone">
                Phone{wholesaleClient ? "" : " (optional)"}
              </Label>
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
                <p className="text-xs text-muted-foreground">
                  {wholesaleClient ? "Existing distributors" : "Existing contacts"}
                </p>
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
            {wholesaleClient ? (
              <Button type="button" variant="outline" onClick={() => setClientOpen(false)}>
                Cancel
              </Button>
            ) : (
              <Button
                type="button"
                variant="outline"
                disabled={saleMutation.isPending}
                onClick={onClientSkip}
              >
                Skip
              </Button>
            )}
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
