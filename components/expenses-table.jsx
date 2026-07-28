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
import { formatMoney } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import { filterByQuery } from "@/lib/table-filter";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

/** ISO string -> the "YYYY-MM-DD" a date input expects, in local time. */
function toDateInputValue(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Shared by the admin expenses page and a seller's own expenses page. The
 * caller supplies the actions, so each side gets its own permission scope.
 */
export function ExpensesTable({
  deleteAction,
  fetchAction,
  initialExpenses,
  queryKey,
  saveAction,
  showRecordedBy = false,
}) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null); // null = closed, {} = new
  const [busyId, setBusyId] = useState(null);

  const { data: expenses } = useQuery({
    queryKey,
    queryFn: fetchAction,
    initialData: initialExpenses,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey }),
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
    ]);

  const saveMutation = useMutation({
    mutationFn: ({ id, formData }) => saveAction(id, formData),
    onSuccess: async (res, { id }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success(id ? "Expense updated." : "Expense recorded.");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteAction(id),
    onSettled: () => setBusyId(null),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("Expense deleted.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const filtered = useMemo(
    () => filterByQuery(expenses, search, (e) => `${e.name} ${e.description ?? ""}`),
    [expenses, search],
  );
  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  const total = useMemo(
    () => filtered.reduce((sum, e) => sum + (e.amountCents ?? 0), 0),
    [filtered],
  );

  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setEditing({})}>
          <PlusIcon />
          New expense
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          search={search}
          searchPlaceholder="Search expenses…"
          onSearchChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        >
          <span className="text-sm text-muted-foreground">
            Total <span className="font-medium text-foreground tabular-nums">{formatMoney(total)}</span>
          </span>
        </TableToolbar>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Description</TableHead>
                {showRecordedBy ? <TableHead>Recorded by</TableHead> : null}
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={showRecordedBy ? 6 : 5}
                  message={search ? "No expenses match your search." : "No expenses yet."}
                />
              ) : (
                paginated.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium text-foreground">{expense.name}</TableCell>
                    <TableCell className="max-w-sm text-muted-foreground">
                      {expense.description || "—"}
                    </TableCell>
                    {showRecordedBy ? (
                      <TableCell className="text-muted-foreground whitespace-nowrap">
                        {expense.recordedByName ?? "—"}
                      </TableCell>
                    ) : null}
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {expense.spentAt ? dateFormatter.format(new Date(expense.spentAt)) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(expense.amountCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Edit ${expense.name}`}
                          onClick={() => setEditing(expense)}
                        >
                          <PencilIcon className="size-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Delete ${expense.name}`}
                          disabled={busyId === expense.id}
                          onClick={() => {
                            setBusyId(expense.id);
                            deleteMutation.mutate(expense.id);
                          }}
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
            <DialogTitle>{editing?.id ? "Edit expense" : "New expense"}</DialogTitle>
            <DialogDescription>
              The date decides which month this lands in on the accounts page.
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              saveMutation.mutate({
                id: editing.id ?? null,
                formData: new FormData(event.currentTarget),
              });
            }}
            className="grid gap-4"
          >
            <div className="grid gap-2">
              <Label htmlFor="expense-name">Name</Label>
              <Input id="expense-name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="expense-description">Description</Label>
              <Textarea
                id="expense-description"
                name="description"
                rows={3}
                defaultValue={editing?.description ?? ""}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="expense-amount">Amount</Label>
                <Input
                  id="expense-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editing?.id ? ((editing.amountCents ?? 0) / 100).toFixed(2) : ""}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expense-date">Date</Label>
                <Input
                  id="expense-date"
                  name="spentAt"
                  type="date"
                  defaultValue={toDateInputValue(editing?.spentAt)}
                  required
                />
              </div>
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
