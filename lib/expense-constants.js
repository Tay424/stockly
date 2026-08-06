/** Fixed expense categories for Phase 2 (no admin CRUD yet). */
export const EXPENSE_CATEGORIES = [
  { value: "transport", label: "Transport" },
  { value: "stock_purchase", label: "Stock purchase" },
  { value: "utilities", label: "Utilities" },
  { value: "packaging", label: "Packaging" },
  { value: "misc", label: "Misc" },
];

export const EXPENSE_STATUS = {
  pending: "pending",
  changesRequested: "changes_requested",
  approved: "approved",
};

export const EXPENSE_STATUS_LABEL = {
  [EXPENSE_STATUS.pending]: "Pending",
  [EXPENSE_STATUS.changesRequested]: "Changes requested",
  [EXPENSE_STATUS.approved]: "Approved",
};

export function categoryLabel(value) {
  return EXPENSE_CATEGORIES.find((c) => c.value === value)?.label ?? value ?? "—";
}

export function isValidCategory(value) {
  return EXPENSE_CATEGORIES.some((c) => c.value === value);
}

/** Legacy rows without status count as approved so old books stay intact. */
export function effectiveExpenseStatus(expense) {
  return expense?.status || EXPENSE_STATUS.approved;
}

export function countsInBooks(expense) {
  return effectiveExpenseStatus(expense) === EXPENSE_STATUS.approved;
}
