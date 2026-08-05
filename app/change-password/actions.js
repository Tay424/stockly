"use server";

import { requireUser } from "@/lib/session";
import { auth } from "@/lib/auth";

/** Clear the first-login flag after the client has successfully changed the password. */
export async function clearMustChangePasswordAction() {
  const session = await requireUser();

  if (!session.user.mustChangePassword) {
    return { ok: true, role: session.user.role };
  }

  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(session.user.id, {
    mustChangePassword: false,
  });

  return { ok: true, role: session.user.role };
}
