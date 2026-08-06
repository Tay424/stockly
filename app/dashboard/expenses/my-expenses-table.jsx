"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import {
  EXPENSE_CATEGORIES,
  EXPENSE_STATUS,
  EXPENSE_STATUS_LABEL,
  categoryLabel,
} from "@/lib/expense-constants";
import { formatMoney } from "@/lib/pricing";
import { queryKeys } from "@/lib/query-keys";
import { filterByQuery } from "@/lib/table-filter";

import {
  deleteMyExpenseAction,
  fetchMyExpensesAction,
  saveMyExpenseAction,
} from "./actions";

const dateFormatter = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });

function toDateInputValue(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const STATUS_TONE = {
  [EXPENSE_STATUS.pending]: "warning",
  [EXPENSE_STATUS.changesRequested]: "info",
  [EXPENSE_STATUS.approved]: "success",
};

const categoryItems = Object.fromEntries(EXPENSE_CATEGORIES.map((c) => [c.value, c.label]));

export function MyExpensesTable({ initialExpenses }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(null);
  const [formCategory, setFormCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [busyId, setBusyId] = useState(null);

  const { data: expenses } = useQuery({
    queryKey: queryKeys.myExpenses,
    queryFn: fetchMyExpensesAction,
    initialData: initialExpenses,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: queryKeys.myExpenses });

  const saveMutation = useMutation({
    mutationFn: ({ id, formData }) => saveMyExpenseAction(id, formData),
    onSuccess: async (res, { id }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success(id ? "Resubmitted for review." : "Expense applied — awaiting approval.");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteMyExpenseAction(id),
    onSettled: () => setBusyId(null),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("Expense discarded.");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const filtered = useMemo(
    () =>
      filterByQuery(
        expenses,
        search,
        (e) => `${e.name} ${e.description ?? ""} ${categoryLabel(e.category)}`,
      ),
    [expenses, search],
  );

  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  const needsAttention = useMemo(
    () => expenses.filter((e) => e.status === EXPENSE_STATUS.changesRequested),
    [expenses],
  );

  function openNew() {
    setFormCategory(EXPENSE_CATEGORIES[0].value);
    setEditing({});
  }

  function openEdit(expense) {
    setFormCategory(expense.category || EXPENSE_CATEGORIES[0].value);
    setEditing(expense);
  }

  return (
    <>
      {needsAttention.length > 0 ? (
        <div className="mb-4 rounded-lg border border-border bg-card px-4 py-3 text-sm">
          <span className="font-medium text-foreground">
            {needsAttention.length} expense{needsAttention.length === 1 ? "" : "s"} need changes.
          </span>{" "}
          <span className="text-muted-foreground">
            Edit and resubmit — they stay out of the books until approved.
          </span>
        </div>
      ) : null}

      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <PlusIcon />
          Apply expense
        </Button>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <TableToolbar
          search={search}
          searchPlaceholder="Search your expenses…"
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
                <TableHead>Category</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={6}
                  message={search ? "No expenses match your search." : "No expenses yet."}
                />
              ) : (
                paginated.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium text-foreground">
                      {expense.name}
                      {expense.changesRequestedReason ? (
                        <span className="mt-1 block text-xs font-normal text-muted-foreground">
                          {expense.changesRequestedReason}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {categoryLabel(expense.category)}
                    </TableCell>
                    <TableCell>
                      <StatusPill tone={STATUS_TONE[expense.status] ?? "muted"}>
                        {EXPENSE_STATUS_LABEL[expense.status] ?? expense.status}
                      </StatusPill>
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {expense.spentAt ? dateFormatter.format(new Date(expense.spentAt)) : "—"}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatMoney(expense.amountCents)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {expense.status === EXPENSE_STATUS.changesRequested ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Edit ${expense.name}`}
                              onClick={() => openEdit(expense)}
                            >
                              <PencilIcon className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon-sm"
                              aria-label={`Discard ${expense.name}`}
                              disabled={busyId === expense.id}
                              onClick={() => {
                                setBusyId(expense.id);
                                deleteMutation.mutate(expense.id);
                              }}
                            >
                              <Trash2Icon className="size-4 text-destructive" />
                            </Button>
                          </>
                        ) : expense.status === EXPENSE_STATUS.pending ? (
                          <span className="text-xs text-muted-foreground">Awaiting admin</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Frozen</span>
                        )}
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
            <DialogTitle>{editing?.id ? "Fix and resubmit" : "Apply expense"}</DialogTitle>
            <DialogDescription>
              {editing?.id
                ? "Update the details (and receipt if needed), then resubmit for approval."
                : "Applications stay pending until an admin approves them. A receipt photo is required."}
            </DialogDescription>
          </DialogHeader>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const formData = new FormData(event.currentTarget);
              formData.set("category", formCategory);
              saveMutation.mutate({ id: editing.id ?? null, formData });
            }}
            className="grid gap-4"
          >
            {editing?.changesRequestedReason ? (
              <p className="rounded-md bg-secondary/60 px-3 py-2 text-sm">
                Admin note: {editing.changesRequestedReason}
              </p>
            ) : null}
            <div className="grid gap-2">
              <Label htmlFor="my-expense-name">Name</Label>
              <Input id="my-expense-name" name="name" defaultValue={editing?.name ?? ""} required />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="my-expense-category">Category</Label>
              <Select value={formCategory} items={categoryItems} onValueChange={setFormCategory}>
                <SelectTrigger id="my-expense-category" className="w-full">
                  <SelectValue placeholder="Pick a category" />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c.value} value={c.value}>
                      {c.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="my-expense-description">Notes</Label>
              <Textarea
                id="my-expense-description"
                name="description"
                rows={2}
                defaultValue={editing?.description ?? ""}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="my-expense-amount">Amount</Label>
                <Input
                  id="my-expense-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editing?.id ? ((editing.amountCents ?? 0) / 100).toFixed(2) : ""}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="my-expense-date">Date</Label>
                <Input
                  id="my-expense-date"
                  name="spentAt"
                  type="date"
                  defaultValue={toDateInputValue(editing?.spentAt)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="my-expense-receipt">
                Receipt {editing?.id ? "(optional if already attached)" : "(required)"}
              </Label>
              <Input
                id="my-expense-receipt"
                name="receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                required={!editing?.id}
              />
              {editing?.receiptUrl ? (
                <p className="text-xs text-muted-foreground">
                  Current receipt on file
                  {editing.receiptName ? `: ${editing.receiptName}` : ""}.
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending
                  ? "Submitting…"
                  : editing?.id
                    ? "Resubmit"
                    : "Submit application"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
