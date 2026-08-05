"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";

import { auth } from "@/lib/auth";
import { requireUser } from "@/lib/session";

function errorMessage(error, fallback) {
  if (error instanceof APIError) {
    return error.body?.message || error.message || fallback;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message) || fallback;
  }
  return fallback;
}

/**
 * First-login password change: verify the temporary password, set a new one,
 * then clear mustChangePassword so the attendant can reach the dashboard.
 */
export async function completeFirstPasswordChangeAction(formData) {
  const session = await requireUser();

  if (!session.user.mustChangePassword) {
    return { error: "Your password is already set." };
  }

  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirmPassword = String(formData.get("confirmPassword") ?? "");

  if (newPassword.length < 8) {
    return { error: "New password must be at least 8 characters." };
  }
  if (newPassword !== confirmPassword) {
    return { error: "New passwords do not match." };
  }
  if (newPassword === currentPassword) {
    return { error: "Choose a password different from the temporary one." };
  }

  try {
    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: true,
      },
      headers: await headers(),
    });
  } catch (err) {
    return { error: errorMessage(err, "Temporary password is incorrect.") };
  }

  const ctx = await auth.$context;
  await ctx.internalAdapter.updateUser(session.user.id, {
    mustChangePassword: false,
  });

  return { ok: true, role: session.user.role };
}
