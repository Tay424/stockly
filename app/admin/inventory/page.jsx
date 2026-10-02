import { PageHeader } from "@/components/page-header";
import {
  getMonthInventorySummary,
  inventoryMonthKey,
  listInventoryHealth,
  listStockReceives,
} from "@/lib/inventory";
import { requireAdmin } from "@/lib/session";

import { InventoryView } from "./inventory-view";

export default async function InventoryPage({ searchParams }) {
  await requireAdmin();
  const params = await searchParams;
  const focusRaw = params?.focus;
  const focus = Array.isArray(focusRaw) ? focusRaw[0] : focusRaw;
  const initialFocus = focus === "not-moving" ? "not-moving" : null;

  const monthKey = inventoryMonthKey();
  const [health, month, recentReceives] = await Promise.all([
    listInventoryHealth(),
    getMonthInventorySummary(monthKey),
    listStockReceives({ monthKey, limit: 25 }),
  ]);

  const needs = health.counts.needsAttention;
  const notMoving = month.notMovingCount ?? 0;
  const descriptionParts = [];
  if (needs) {
    descriptionParts.push(
      `${needs} product${needs === 1 ? "" : "s"} need replenishment`,
    );
  }
  if (notMoving) {
    descriptionParts.push(
      `${notMoving} not moving this month (sold 0, still on hand)`,
    );
  }

  return (
    <>
      <PageHeader
        title="Inventory"
        description={
          descriptionParts.length > 0
            ? `${descriptionParts.join(". ")}. Receive stock here; Integrity stays for ledger disputes.`
            : "Stock health, month product performance, and receive replenishment."
        }
      />
      <InventoryView
        initialHealth={health}
        initialMonth={month}
        initialReceives={recentReceives}
        initialFocus={initialFocus}
      />
    </>
  );
}
