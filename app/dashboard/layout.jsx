import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { countChangesRequestedFor } from "@/lib/finance";
import { requireUser } from "@/lib/session";

export default async function DashboardLayout({ children }) {
  const { user } = await requireUser();
  const changesRequested = await countChangesRequestedFor(user.id);

  if (user.mustChangePassword) redirect("/change-password");

  return (
    <DashboardShell
      role={user.role === "admin" ? "admin" : "user"}
      user={user}
      badges={
        changesRequested > 0 ? { "/dashboard/expenses": changesRequested } : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
