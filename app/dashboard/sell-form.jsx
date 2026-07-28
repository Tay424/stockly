"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
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
import { TableEmptyRow } from "@/components/table-toolbar";
import {
  basePriceFor,
  formatMoney,
  isDiscountActive,
  isWholesale,
  lineTotal,
  unitPriceFor,
} from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";

import { fetchMySalesAction, fetchSellableProductsAction, recordSaleAction } from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export function SellForm({ initialProducts, initialSales }) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [productId, setProductId] = useState("");
  const [quantity, setQuantity] = useState("1");

  const { data: products } = useQuery({
    queryKey: queryKeys.sellableProducts,
    queryFn: fetchSellableProductsAction,
    initialData: initialProducts,
  });

  const { data: sales } = useQuery({
    queryKey: queryKeys.mySales,
    queryFn: fetchMySalesAction,
    initialData: initialSales,
  });

  const product = products.find((p) => p.id === productId) ?? null;
  const qty = Number(quantity);
  const validQty = Number.isInteger(qty) && qty >= 1;

  // Mirrors the server calculation so the seller sees the price before
  // committing. The server recomputes it — this is preview only.
  const preview = useMemo(() => {
    if (!product || !validQty) return null;
    return {
      base: basePriceFor(product, qty),
      unit: unitPriceFor(product, qty),
      total: lineTotal(product, qty),
      wholesale: isWholesale(product, qty),
      discounted: isDiscountActive(product),
    };
  }, [product, qty, validQty]);

  const overStock = product && validQty && qty > product.stock;

  const productItems = useMemo(
    () => products.map((p) => ({ value: p.id, label: `${p.name} · ${p.stock} in stock` })),
    [products],
  );

  const saleMutation = useMutation({
    mutationFn: () => recordSaleAction(productId, qty),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.sellableProducts }),
        queryClient.invalidateQueries({ queryKey: queryKeys.mySales }),
      ]);
      router.refresh(); // the stat cards above are server-rendered
      toast.success(`Sale recorded. ${res.stockLeft} left in stock.`);
      setProductId("");
      setQuantity("1");
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
    saleMutation.mutate();
  }

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <Card>
        <CardHeader>
          <CardTitle>Record a sale</CardTitle>
          <CardDescription>Stock comes down as soon as the sale is saved.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-4">
            <div className="grid gap-2">
              <Label htmlFor="sale-product">Product</Label>
              <Select value={productId} items={productItems} onValueChange={setProductId}>
                <SelectTrigger id="sale-product" className="w-full">
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
              <Input
                id="sale-quantity"
                type="number"
                min="1"
                step="1"
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                required
              />
              {overStock ? (
                <p className="text-xs text-destructive">
                  Only {product.stock} in stock.
                </p>
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

            <Button type="submit" disabled={saleMutation.isPending || overStock || !product}>
              {saleMutation.isPending ? "Recording…" : "Record sale"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-3">
          <h2 className="text-sm font-medium">Your recent sales</h2>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Product</TableHead>
                <TableHead className="text-right">Qty</TableHead>
                <TableHead className="text-right">Unit</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sales.length === 0 ? (
                <TableEmptyRow colSpan={5} message="You have not recorded any sales yet." />
              ) : (
                sales.map((sale) => (
                  <TableRow key={sale.id}>
                    <TableCell className="font-medium text-foreground">
                      {sale.productName}
                      {sale.wholesale || sale.discountPercent > 0 ? (
                        <span className="block text-xs font-normal text-muted-foreground">
                          {[
                            sale.wholesale ? "wholesale" : null,
                            sale.discountPercent > 0 ? `${sale.discountPercent}% off` : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{sale.quantity}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(sale.unitPriceCents)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(sale.totalCents)}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {sale.createdAt ? dateFormatter.format(new Date(sale.createdAt)) : "—"}
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
