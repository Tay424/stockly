import { DashboardShell } from "@/components/dashboard-shell";
import { countChangesRequestedFor } from "@/lib/finance";
import { requireUser } from "@/lib/session";

export default async function DashboardLayout({ children }) {
  const { user } = await requireUser();
  const changesRequested = await countChangesRequestedFor(user.id);

  return (
    <DashboardShell
      role="user"
      user={user}
      badges={
        changesRequested > 0 ? { "/dashboard/expenses": changesRequested } : undefined
      }
    >
      {children}
    </DashboardShell>
  );
}
