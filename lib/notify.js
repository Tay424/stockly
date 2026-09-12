import "server-only";

/**
 * Phase 2 notifications. Email is best-effort — in-app badges still ship when
 * SMTP / mail secrets are missing.
 */
export async function notifyExpenseStatus({ expense, toEmail, kind }) {
  const subject =
    kind === "approved"
      ? `Expense approved: ${expense.name}`
      : `Changes requested: ${expense.name}`;
  const body =
    kind === "approved"
      ? `Your expense "${expense.name}" (${((expense.amountCents ?? 0) / 100).toFixed(2)}) was approved.`
      : `Your expense "${expense.name}" needs changes: ${expense.changesRequestedReason || "See Stockly for details."}`;

  // No SMTP configured in this environment — log so the trail is visible in demos.
  console.info("[notify]", { toEmail, subject, body, kind, expenseId: expense.id });
  return { sent: false, reason: "Email provider not configured." };
}

/** Low-stock alert when a product crosses into low / out territory. */
export async function notifyLowStock({ product, stock, threshold }) {
  const status = stock <= 0 ? "out of stock" : "running low";
  const subject = `Stock ${status}: ${product.name}`;
  const body = `${product.name} is ${status} (${stock} on hand; alert at ≤ ${threshold}). Replenish from Admin → Inventory.`;

  console.info("[notify]", {
    kind: "low_stock",
    subject,
    body,
    productId: product.id,
    stock,
    threshold,
  });
  return { sent: false, reason: "Email provider not configured." };
}
