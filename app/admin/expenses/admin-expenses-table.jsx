"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { EyeIcon, PencilIcon, PlusIcon, Trash2Icon } from "lucide-react";
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
import { filterByQuery, filterTriggerClassName } from "@/lib/table-filter";

import {
  approveExpenseAction,
  deleteExpenseAction,
  fetchExpensesAction,
  requestExpenseChangesAction,
  saveAdminExpenseAction,
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

export function AdminExpensesTable({ initialExpenses }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [editing, setEditing] = useState(null);
  const [formCategory, setFormCategory] = useState(EXPENSE_CATEGORIES[0].value);
  const [detail, setDetail] = useState(null);
  const [changesReason, setChangesReason] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [zoomUrl, setZoomUrl] = useState(null);

  const { data: expenses } = useQuery({
    queryKey: queryKeys.expenses,
    queryFn: fetchExpensesAction,
    initialData: initialExpenses,
  });

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: queryKeys.expenses }),
      queryClient.invalidateQueries({ queryKey: queryKeys.pendingExpenses }),
      queryClient.invalidateQueries({ queryKey: queryKeys.accounts }),
    ]);

  const saveMutation = useMutation({
    mutationFn: ({ id, formData }) => saveAdminExpenseAction(id, formData),
    onSuccess: async (res, { id }) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success(id ? "Expense updated." : "Expense recorded (approved).");
      setEditing(null);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => deleteExpenseAction(id),
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

  const approveMutation = useMutation({
    mutationFn: (id) => approveExpenseAction(id),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("Expense approved.");
      setDetail(null);
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const changesMutation = useMutation({
    mutationFn: ({ id, reason }) => requestExpenseChangesAction(id, reason),
    onSuccess: async (res) => {
      if (res.error) {
        toast.error(res.error);
        return;
      }
      await refresh();
      toast.success("Sent back for changes.");
      setDetail(null);
      setChangesReason("");
    },
    onError: () => toast.error("Something went wrong. Try again."),
  });

  const pending = useMemo(
    () => expenses.filter((e) => e.status === EXPENSE_STATUS.pending),
    [expenses],
  );

  const filtered = useMemo(() => {
    let rows = filterByQuery(
      expenses,
      search,
      (e) => `${e.name} ${e.description ?? ""} ${e.recordedByName ?? ""} ${categoryLabel(e.category)}`,
    );
    if (statusFilter !== "all") rows = rows.filter((e) => e.status === statusFilter);
    return rows;
  }, [expenses, search, statusFilter]);

  const { page, paginated, setPage, totalItems, totalPages, pageSize } =
    useTablePagination(filtered);

  const approvedTotal = useMemo(
    () =>
      filtered
        .filter((e) => e.status === EXPENSE_STATUS.approved)
        .reduce((sum, e) => sum + (e.amountCents ?? 0), 0),
    [filtered],
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
      {pending.length > 0 ? (
        <section className="mb-8 overflow-hidden rounded-lg border border-border bg-card">
          <div className="border-b border-border px-4 py-3">
            <h2 className="text-sm font-medium">Pending applications ({pending.length})</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Attendant submissions waiting for approve or send-back. Pending never hits the books.
            </p>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pending.map((expense) => (
                <TableRow key={expense.id}>
                  <TableCell className="font-medium">{expense.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {categoryLabel(expense.category)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {expense.recordedByName ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(expense.amountCents)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button size="sm" onClick={() => setDetail(expense)}>
                      Review
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </section>
      ) : null}

      <div className="mb-4 flex justify-end">
        <Button onClick={openNew}>
          <PlusIcon />
          Log expense
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
            Approved total{" "}
            <span className="font-medium text-foreground tabular-nums">
              {formatMoney(approvedTotal)}
            </span>
          </span>
          <Select
            value={statusFilter}
            items={{
              all: "All statuses",
              [EXPENSE_STATUS.pending]: "Pending",
              [EXPENSE_STATUS.changesRequested]: "Changes requested",
              [EXPENSE_STATUS.approved]: "Approved",
            }}
            onValueChange={(value) => {
              setStatusFilter(value);
              setPage(1);
            }}
          >
            <SelectTrigger className={filterTriggerClassName}>
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent align="end">
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value={EXPENSE_STATUS.pending}>Pending</SelectItem>
              <SelectItem value={EXPENSE_STATUS.changesRequested}>Changes requested</SelectItem>
              <SelectItem value={EXPENSE_STATUS.approved}>Approved</SelectItem>
            </SelectContent>
          </Select>
        </TableToolbar>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Recorded by</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Date</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableEmptyRow
                  colSpan={7}
                  message={
                    search || statusFilter !== "all"
                      ? "No expenses match your filters."
                      : "No expenses yet."
                  }
                />
              ) : (
                paginated.map((expense) => (
                  <TableRow key={expense.id}>
                    <TableCell className="font-medium text-foreground">{expense.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {categoryLabel(expense.category)}
                    </TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {expense.recordedByName ?? "—"}
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
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`View ${expense.name}`}
                          onClick={() => setDetail(expense)}
                        >
                          <EyeIcon className="size-4" />
                        </Button>
                        {expense.status === EXPENSE_STATUS.approved ? (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`Edit ${expense.name}`}
                            onClick={() => openEdit(expense)}
                          >
                            <PencilIcon className="size-4" />
                          </Button>
                        ) : null}
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
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "Edit approved expense" : "Log expense"}</DialogTitle>
            <DialogDescription>
              Admin logs are approved immediately and count in monthly accounts. Receipt optional.
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
            <div className="grid gap-2">
              <Label htmlFor="admin-expense-name">Name</Label>
              <Input
                id="admin-expense-name"
                name="name"
                defaultValue={editing?.name ?? ""}
                required
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-expense-category">Category</Label>
              <Select
                value={formCategory}
                items={categoryItems}
                onValueChange={setFormCategory}
              >
                <SelectTrigger id="admin-expense-category" className="w-full">
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
              <Label htmlFor="admin-expense-description">Notes</Label>
              <Textarea
                id="admin-expense-description"
                name="description"
                rows={2}
                defaultValue={editing?.description ?? ""}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor="admin-expense-amount">Amount</Label>
                <Input
                  id="admin-expense-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  defaultValue={editing?.id ? ((editing.amountCents ?? 0) / 100).toFixed(2) : ""}
                  required
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="admin-expense-date">Date</Label>
                <Input
                  id="admin-expense-date"
                  name="spentAt"
                  type="date"
                  defaultValue={toDateInputValue(editing?.spentAt)}
                  required
                />
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="admin-expense-receipt">Receipt (optional)</Label>
              <Input
                id="admin-expense-receipt"
                name="receipt"
                type="file"
                accept="image/jpeg,image/png,image/webp"
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

      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDetail(null);
            setChangesReason("");
          }
        }}
      >
        <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{detail?.name}</DialogTitle>
            <DialogDescription>
              {detail ? categoryLabel(detail.category) : ""} ·{" "}
              {detail ? formatMoney(detail.amountCents) : ""}
            </DialogDescription>
          </DialogHeader>
          {detail ? (
            <div className="grid gap-4">
              <div className="flex flex-wrap gap-2">
                <StatusPill tone={STATUS_TONE[detail.status] ?? "muted"}>
                  {EXPENSE_STATUS_LABEL[detail.status] ?? detail.status}
                </StatusPill>
                <span className="text-sm text-muted-foreground">
                  {detail.recordedByName ?? "—"}
                  {detail.spentAt
                    ? ` · ${dateFormatter.format(new Date(detail.spentAt))}`
                    : ""}
                </span>
              </div>
              {detail.description ? (
                <p className="text-sm text-muted-foreground">{detail.description}</p>
              ) : null}
              {detail.changesRequestedReason ? (
                <p className="rounded-md bg-secondary/60 px-3 py-2 text-sm">
                  Changes requested: {detail.changesRequestedReason}
                </p>
              ) : null}
              {detail.receiptUrl ? (
                <button
                  type="button"
                  className="overflow-hidden rounded-lg border border-border text-left"
                  onClick={() => setZoomUrl(detail.receiptUrl)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={detail.receiptThumbUrl || detail.receiptUrl}
                    alt="Receipt"
                    width={480}
                    height={480}
                    loading="lazy"
                    decoding="async"
                    className="max-h-64 w-full object-contain bg-secondary/40"
                  />
                  <span className="block px-3 py-2 text-xs text-muted-foreground">
                    Click to zoom
                  </span>
                </button>
              ) : (
                <p className="text-sm text-muted-foreground">No receipt attached.</p>
              )}

              {detail.status === EXPENSE_STATUS.pending ? (
                <div className="grid gap-3 border-t border-border pt-4">
                  <div className="grid gap-2">
                    <Label htmlFor="changes-reason">Request changes reason</Label>
                    <Textarea
                      id="changes-reason"
                      rows={2}
                      value={changesReason}
                      onChange={(event) => setChangesReason(event.target.value)}
                      placeholder="What should the attendant fix?"
                    />
                  </div>
                  <DialogFooter className="gap-2 sm:justify-between">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={changesMutation.isPending || !changesReason.trim()}
                      onClick={() =>
                        changesMutation.mutate({
                          id: detail.id,
                          reason: changesReason.trim(),
                        })
                      }
                    >
                      Request changes
                    </Button>
                    <Button
                      type="button"
                      disabled={approveMutation.isPending}
                      onClick={() => approveMutation.mutate(detail.id)}
                    >
                      {approveMutation.isPending ? "Approving…" : "Approve"}
                    </Button>
                  </DialogFooter>
                </div>
              ) : null}
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(zoomUrl)} onOpenChange={(open) => !open && setZoomUrl(null)}>
        <DialogContent className="max-w-3xl border-none bg-transparent p-0 shadow-none sm:max-w-3xl">
          {zoomUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={zoomUrl}
              alt="Receipt zoom"
              loading="eager"
              decoding="async"
              className="max-h-[85svh] w-full rounded-lg object-contain"
            />
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}
