"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
import { toast } from "sonner";

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
import { filterByQuery } from "@/lib/table-filter";

import { deleteCategoryAction, fetchCategoriesAction, saveCategoryAction } from "./actions";

export function CategoriesTable({ initialCategories }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null = closed, {} = new
  const [busyId, setBusyId] = useState(null);

  const { data: categories } = useQuery({
    queryKey: queryKeys.categories,
    queryFn: fetchCategoriesAction,
    initialData: initialCategories,
  });

  // Products show their category name, so both caches go stale on a write.
  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.categories }),
      queryClient.invalidateQueries({ queryKey: queryKeys.products }),
    ]);

  const saveMutation = useMutation({
    mutationFn: ({ id, formData }) => saveCategoryAction(id, formData),
    onSuccess: async (res, { id }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success(id ? "Category updated." : "Category created.");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteCategoryAction(id),
    onSettled: () => setBusyId(null),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("Category deleted.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const filtered = useMemo(
    () => filterByQuery(categories, search, (c) => `${c.name} ${c.description ?? ""}`),
    [categories, search],
  );
  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  function onSubmit(event) {
    event.preventDefault();
    saveMutation.mutate({
      id: editing.id ?? null,
      formData: new FormData(event.currentTarget),
    });
  }

  function onDelete(category) {
    setBusyId(category.id);
    deleteMutation.mutate(category.id);
  }

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing({})}>
          <PlusIcon />
          New category
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          search={search}
          searchPlaceholder="Search categories…"
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        />
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={3}
                  message={search ? "No categories match your search." : "No categories yet."}
                />
              ) : (
                paginated.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell className="font-medium text-foreground">{category.name}</TableCell>
                    <TableCell className="max-w-md text-muted-foreground">
                      {category.description || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${category.name}`}
                          onClick={() => setEditing(category)}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${category.name}`}
                          disabled={busyId === category.id}
                          onClick={() => onDelete(category)}
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
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit category" : "New category"}</DialogTitle>
            <DialogDescription>A name and a short description.</DialogDescription>
          </DialogHeader>
          {/* Remount when switching create/edit so uncontrolled defaultValues stay in sync. */}
          <form
            key={editing?.id ?? "new"}
            onSubmit={onSubmit}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="category-name">Name</Label>
              <Input
                id="category-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="category-description">Description</Label>
              <Textarea
                id="category-description"
                name="description"
                rows={3}
                defaultValue={editing?.description ?? ""}
              />
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
