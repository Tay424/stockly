"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MinusIcon, PlusIcon } from "lucide-react";
import { toast } from "sonner";

import { StatusPill } from "@/components/status-pill";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  basePriceFor,
  formatMoney,
  isDiscountActive,
  isWholesale,
  lineTotal,
  unitPriceFor,
} from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";

import { fetchSellableProductsAction, recordSaleAction } from "./actions";

export function SellForm({ initialProducts }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState(1);

  const { data: products } = useQuery({
    queryKey: queryKeys.sellableProducts,
    queryFn: fetchSellableProductsAction,
    initialData: initialProducts,
  });

  // If the selected product sold out, treat selection as empty without an effect.
  const product = products.find((p) => p.id === productId) ?? null;
  const selectValue = product?.id ?? "";
  const validQty = Number.isInteger(quantity) && quantity >= 1;
  const overStock = Boolean(product && validQty && quantity > product.stock);
  const maxQty = product?.stock ?? 0;

  const preview = useMemo(() => {
    if (!product || !validQty) return null;
    return {
      base: basePriceFor(product, quantity),
      unit: unitPriceFor(product, quantity),
      total: lineTotal(product, quantity),
      wholesale: isWholesale(product, quantity),
      discounted: isDiscountActive(product),
    };
  }, [product, quantity, validQty]);

  const productItems = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name} · ${p.stock} in stock` })),
    [products],
  );

  function selectProduct(id) {
    setProductId(id);
    setQuantity(1);
  }

  function bumpQty(delta) {
    setQuantity((current) => {
      const next = Math.max(1, current + delta);
      if (product) return Math.min(next, product.stock);
      return next;
    });
  }

  const saleMutation = useMutation({
    mutationFn: () => recordSaleAction(productId, quantity),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sellableProducts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mySales }),
      ]);
      router.refresh();
      toast.success(`Sale recorded. ${res.stockLeft} left in stock.`);
      // Keep product selected for the next sale; reset qty for speed.
      setQuantity(1);
      if (res.stockLeft === 0) {
        setProductId("");
      }
    },
    onError: () => toast.error("Could not record that sale. Try again."),
  });

  function onSubmit(event) {
    event.preventDefault();
    if (!product) {
      toast.error("Pick a product first.");
      return;
    }
    if (!validQty) {
      toast.error("Quantity must be a whole number of at least 1.");
      return;
    }
    if (overStock) {
      toast.error(`Only ${product.stock} in stock.`);
      return;
    }
    saleMutation.mutate();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Record a sale</CardTitle>
        <CardDescription>Stock comes down as soon as the sale is saved.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="grid gap-5">
          <div className="grid gap-2">
            <Label htmlFor="sale-product">Product</Label>
            <Select value={selectValue} items={productItems} onValueChange={selectProduct}>
              <SelectTrigger id="sale-product" className="h-11 w-full text-base md:text-sm">
                <SelectValue placeholder="Pick a product" />
              </SelectTrigger>
              <SelectContent>
                {products.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} · {p.stock} in stock
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {products.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Nothing in stock right now — ask your admin to restock.
              </p>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label htmlFor="sale-quantity">Quantity</Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Decrease quantity"
                disabled={quantity <= 1 || saleMutation.isPending}
                onClick={() => bumpQty(-1)}
              >
                <MinusIcon className="size-5" />
              </Button>
              <div
                id="sale-quantity"
                className="flex h-11 min-w-16 flex-1 items-center justify-center rounded-lg border border-input text-lg font-medium tabular-nums"
                aria-live="polite"
              >
                {quantity}
              </div>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="size-11 shrink-0"
                aria-label="Increase quantity"
                disabled={!product || quantity >= maxQty || saleMutation.isPending}
                onClick={() => bumpQty(1)}
              >
                <PlusIcon className="size-5" />
              </Button>
            </div>
            {product ? (
              <p className="text-xs text-muted-foreground">{product.stock} available</p>
            ) : null}
            {overStock ? (
              <p className="text-xs text-destructive">Only {product.stock} in stock.</p>
            ) : null}
          </div>

          {preview ? (
            <div className="grid gap-2 rounded-lg border border-border bg-secondary/50 p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Unit price</span>
                <span className="tabular-nums">
                  {preview.unit !== preview.base ? (
                    <span className="mr-2 text-muted-foreground line-through">
                      {formatMoney(preview.base)}
                    </span>
                  ) : null}
                  <span className="font-medium">{formatMoney(preview.unit)}</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Total</span>
                <span className="text-base font-medium tabular-nums">
                  {formatMoney(preview.total)}
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                <StatusPill tone={preview.wholesale ? "info" : "muted"}>
                  {preview.wholesale ? "Wholesale price" : "Retail price"}
                </StatusPill>
                {preview.discounted ? (
                  <StatusPill tone="success">{product.discountPercent}% off</StatusPill>
                ) : null}
              </div>
            </div>
          ) : null}

          <Button
            type="submit"
            size="lg"
            className="h-11 w-full text-base"
            disabled={saleMutation.isPending || overStock || !product}
          >
            {saleMutation.isPending ? "Recording…" : "Record sale"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
