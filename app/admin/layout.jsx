import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { requireAdmin } from "@/lib/session";

export default async function AdminLayout({ children }) {
  const { user } = await requireAdmin();

  if (user.mustChangePassword) redirect("/change-password");

  return (
    <DashboardShell role="admin" user={user}>
      {children}
    </DashboardShell>
  );
}
