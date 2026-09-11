"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDownIcon, PercentIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { discountStatus, formatMoney } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import { filterByQuery, filterTriggerClassName } from "@/lib/table-filter";
import { cn } from "@/lib/utils";

import { fetchCategoriesAction } from "../categories/actions";
import { deleteProductAction, fetchProductsAction, saveProductAction } from "./actions";

const toAmount = (cents) => ((cents ?? 0) / 100).toFixed(2);

const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

/** ISO string -> the "YYYY-MM-DDTHH:mm" local format datetime-local expects. */
function toLocalInputValue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const DISCOUNT_TONES = { active: "success", scheduled: "info", expired: "muted" };

function DiscountCell({ product }) {
  const status = discountStatus(product);
  if (status === "none") return <span className="text-muted-foreground">—</span>;

  const window = [product.discountStartsAt, product.discountEndsAt]
    .map((d) => (d ? dateFormatter.format(new Date(d)) : "no end"))
    .join(" → ");

  return (
    <div className="flex flex-col items-start gap-1">
      <StatusPill tone={DISCOUNT_TONES[status]}>
        {product.discountPercent}% off
        {status === "active" ? "" : ` · ${status}`}
      </StatusPill>
      <span className="text-xs text-muted-foreground whitespace-nowrap">{window}</span>
    </div>
  );
}

export function ProductsTable({ initialCategories, initialProducts }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [editing, setEditing] = useState(null); // null = closed, {} = new
  const [formCategoryId, setFormCategoryId] = useState("");
  const [formStock, setFormStock] = useState(0);
  const [discountOpen, setDiscountOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const { data: products } = useQuery({
    queryKey: queryKeys.products,
    queryFn: fetchProductsAction,
    initialData: initialProducts,
  });

  const { data: categories } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: fetchCategoriesAction,
    initialData: initialCategories,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.products });

  const saveMutation = useMutation({
    mutationFn: ({ id, formData }) => saveProductAction(id, formData),
    onSuccess: async (res, { id }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success(id ? "Product updated." : "Product created.");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteProductAction(id),
    onSettled: () => setBusyId(null),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("Product deleted.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const filtered = useMemo(() => {
    let rows = filterByQuery(
      products,
      search,
      (p) => `${p.name} ${p.description ?? ""} ${p.categoryName ?? ""}`,
    );
    if (categoryFilter !== "all") rows = rows.filter((p) => p.categoryId === categoryFilter);
    return rows;
  }, [products, search, categoryFilter]);

  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  // Base UI renders the raw value in the trigger unless it knows the labels.
  const categoryItems = useMemo(
    () => categories.map((category) => ({ value: category.id, label: category.name })),
    [categories],
  );

  function openForm(product) {
    setFormCategoryId(product?.categoryId ?? "");
    setFormStock(product?.stock ?? 0);
    setDiscountOpen((product?.discountPercent ?? 0) > 0);
    setEditing(product ?? {});
  }

  function onSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    formData.set("categoryId", formCategoryId);
    saveMutation.mutate({ id: editing.id ?? null, formData });
  }

  function onDelete(product) {
    setBusyId(product.id);
    deleteMutation.mutate(product.id);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => openForm(null)} disabled={categories.length === 0}>
          <PlusIcon />
          New product
        </Button>
      </div>

      {categories.length === 0 ? (
        <p className="mb-4 text-sm text-muted-foreground">
          Create a category first — every product belongs to one.
        </p>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          search={search}
          searchPlaceholder="Search products…"
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        >
          <Select
            value={categoryFilter}
            items={[{ value: "all", label: "All categories" }, ...categoryItems]}
            onValueChange={(value) => {
              setCategoryFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className={filterTriggerClassName}>
              <SelectValue placeholder="All categories" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((category) => (
                <SelectItem key={category.id} value={category.id}>
                  {category.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </TableToolbar>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-14">Image</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Retail</TableHead>
                <TableHead>Discount</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={7}
                  message={
                    search || categoryFilter !== "all"
                      ? "No products match your filters."
                      : "No products yet."
                  }
                />
              ) : (
                paginated.map((product) => (
                  <TableRow key={product.id}>
                    <TableCell>
                      {product.imageUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="size-10 rounded-md object-cover"
                        />
                      ) : (
                        <span className="flex size-10 items-center justify-center rounded-md bg-muted text-[10px] text-muted-foreground">
                          —
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="font-medium text-foreground">
                      {product.name}
                      {product.description ? (
                        <span className="block max-w-xs truncate text-xs font-normal text-muted-foreground">
                          {product.description}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {product.categoryName ?? "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMoney(product.retailPriceCents)}
                    </TableCell>
                    <TableCell>
                      <DiscountCell product={product} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{product.stock ?? 0}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${product.name}`}
                          onClick={() => openForm(product)}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${product.name}`}
                          disabled={busyId === product.id}
                          onClick={() => onDelete(product)}
                        >
                          <Trash2Icon className="size-4 text-destructive" />
                        </Button>
                      </div>
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

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit product" : "New product"}</DialogTitle>
            <DialogDescription>
              Set the retail unit price here. Wholesale applies only via category packs (Categories
              → pack qty and pack price) when a receipt hits those quantities.
            </DialogDescription>
          </DialogHeader>
          {/* Remount when switching create/edit/product so uncontrolled defaultValues stay in sync. */}
          <form
            key={editing?.id ?? "new"}
            onSubmit={onSubmit}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="product-name">Name</Label>
              <Input id="product-name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="product-description">Description</Label>
              <Textarea
                id="product-description"
                name="description"
                rows={2}
                defaultValue={editing?.description ?? ""}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="product-image">Product image</Label>
              {editing?.imageUrl ? (
                <div className="flex items-center gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={editing.imageUrl}
                    alt=""
                    className="size-16 rounded-lg object-cover"
                  />
                  <p className="text-xs text-muted-foreground">
                    Current image. Upload a new file to replace it.
                  </p>
                </div>
              ) : null}
              <Input
                id="product-image"
                name="image"
                type="file"
                accept="image/jpeg,image/png,image/webp"
              />
              <p className="text-xs text-muted-foreground">
                Optional JPEG, PNG, or WebP (max 4MB). Shown as tiles on the Sales receipt picker.
              </p>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="product-category">Category</Label>
              <Select
                value={formCategoryId}
                items={categoryItems}
                onValueChange={setFormCategoryId}
              >
                <SelectTrigger id="product-category" className="w-full">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((category) => (
                    <SelectItem key={category.id} value={category.id}>
                      {category.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="product-retail">Retail price</Label>
                <Input
                  id="product-retail"
                  name="retailPrice"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editing?.id ? toAmount(editing.retailPriceCents) : ""}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="product-stock">Stock on hand</Label>
                <Input
                  id="product-stock"
                  name="stock"
                  type="number"
                  min="0"
                  step="1"
                  value={formStock}
                  onChange={(event) => setFormStock(Number(event.target.value))}
                  required
                />
              </div>
            </div>

            {(() => {
              const originalStock = editing?.id ? (editing.stock ?? 0) : 0;
              const stockChanging = editing?.id
                ? formStock !== originalStock
                : formStock > 0;
              if (!stockChanging) return null;
              return (
                <div className="grid gap-2">
                  <Label htmlFor="product-stock-reason">Stock change reason</Label>
                  <Textarea
                    id="product-stock-reason"
                    name="stockReason"
                    rows={2}
                    required
                    placeholder={
                      editing?.id
                        ? "Why is stock changing? (required for the ledger)"
                        : "Why are you setting this opening stock?"
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Every stock change is written to the movement ledger — no silent edits.
                  </p>
                </div>
              );
            })()}

            <div className="grid gap-2">
              <Button
                type="button"
                variant="outline"
                className="w-full justify-between"
                aria-expanded={discountOpen}
                onClick={() => setDiscountOpen((open) => !open)}
              >
                <span className="inline-flex items-center gap-2">
                  <PercentIcon className="size-4" />
                  Discount
                  {(editing?.discountPercent ?? 0) > 0 ? (
                    <StatusPill tone="success">{editing.discountPercent}% off</StatusPill>
                  ) : null}
                </span>
                <ChevronDownIcon
                  className={cn(
                    "size-4 text-muted-foreground transition-transform",
                    discountOpen && "rotate-180",
                  )}
                />
              </Button>

              {/* Keep fields mounted while collapsed so values still submit / persist. */}
              <fieldset
                className={cn(
                  "grid gap-4 rounded-lg border border-border p-4",
                  !discountOpen && "hidden",
                )}
              >
                <legend className="sr-only">Discount details</legend>
                <div className="grid gap-2">
                  <Label htmlFor="product-discount">Percent off</Label>
                  <Input
                    id="product-discount"
                    name="discountPercent"
                    type="number"
                    min="0"
                    max="100"
                    step="1"
                    defaultValue={editing?.discountPercent ?? 0}
                  />
                  <p className="text-xs text-muted-foreground">
                    Percent off the retail unit price. 0 means no discount. Not applied on Sales
                    receipt leftovers.
                  </p>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="product-discount-start">Starts</Label>
                    <Input
                      id="product-discount-start"
                      name="discountStartsAt"
                      type="datetime-local"
                      defaultValue={toLocalInputValue(editing?.discountStartsAt)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="product-discount-end">Ends</Label>
                    <Input
                      id="product-discount-end"
                      name="discountEndsAt"
                      type="datetime-local"
                      defaultValue={toLocalInputValue(editing?.discountEndsAt)}
                    />
                    <p className="text-xs text-muted-foreground">Leave empty to run indefinitely.</p>
                  </div>
                </div>
              </fieldset>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
