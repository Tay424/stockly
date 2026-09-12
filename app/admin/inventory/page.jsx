import { PageHeader } from "@/components/page-header";
import {
  getMonthInventorySummary,
  inventoryMonthKey,
  listInventoryHealth,
  listStockReceives,
} from "@/lib/inventory";
import { requireAdmin } from "@/lib/session";

import { InventoryView } from "./inventory-view";

export default async function InventoryPage() {
  await requireAdmin();
  const monthKey = inventoryMonthKey();
  const [health, month, recentReceives] = await Promise.all([
    listInventoryHealth(),
    getMonthInventorySummary(monthKey),
    listStockReceives({ monthKey, limit: 25 }),
  ]);

  const needs = health.counts.needsAttention;
  return (
    <>
      <PageHeader
        title="Inventory"
        description={
          needs
            ? `${needs} product${needs === 1 ? "" : "s"} need replenishment. Receive stock here; Integrity stays for ledger disputes.`
            : "Stock health, receive replenishment, and this month’s opening carry-over."
        }
      />
      <InventoryView
        initialHealth={health}
        initialMonth={month}
        initialReceives={recentReceives}
      />
    </>
  );
}
