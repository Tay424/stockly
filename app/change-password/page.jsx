import { redirect } from "next/navigation";

import { destinationFor } from "@/lib/destination";
import { requireUser } from "@/lib/session";

import { ChangePasswordForm } from "./change-password-form";

export default async function ChangePasswordPage() {
  const session = await requireUser();

  if (!session.user.mustChangePassword) {
    redirect(destinationFor({ ...session.user, mustChangePassword: false }));
  }

  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <ChangePasswordForm name={session.user.name} />
    </main>
  );
}
