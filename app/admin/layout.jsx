import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { countPendingExpenses } from "@/lib/finance";
import { countLowStockProducts } from "@/lib/inventory";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }) {
  const { user } = await requireAdmin();
  const [pendingExpenses, lowStockCount] = await Promise.all([
    countPendingExpenses(),
    countLowStockProducts(),
  ]);

  if (user.mustChangePassword) redirect("/change-password");

  const badges = {};
  if (pendingExpenses > 0) badges["/admin/expenses"] = pendingExpenses;
  if (lowStockCount > 0) badges["/admin/inventory"] = lowStockCount;

  return (
    <DashboardShell
      role="admin"
      user={user}
      badges={Object.keys(badges).length ? badges : undefined}
    >
      {children}
    </DashboardShell>
  );
}
