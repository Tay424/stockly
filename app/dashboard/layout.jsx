import { redirect } from "next/navigation";

import { DashboardShell } from "@/components/dashboard-shell";
import { requireUser } from "@/lib/session";

export default async function DashboardLayout({ children }) {
  const { user } = await requireUser();

  if (user.mustChangePassword) redirect("/change-password");

  return (
    <DashboardShell role="user" user={user}>
      {children}
    </DashboardShell>
  );
}
