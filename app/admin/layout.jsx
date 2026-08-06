import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { countPendingExpenses } from "@/lib/finance";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }) {
  const { user } = await requireAdmin();
  const pendingExpenses = await countPendingExpenses();

  if (user.mustChangePassword) redirect("/change-password");

  return (
    <DashboardShell
      role="admin"
      user={user}
      badges={pendingExpenses > 0 ? { "/admin/expenses": pendingExpenses } : undefined}
    >
      {children}
    </DashboardShell>
  );
}
