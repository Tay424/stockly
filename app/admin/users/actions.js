"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import { generateTemporaryPassword } from "@/lib/password";
import { requireAdmin } from "@/lib/session";

function readCreateForm(formData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@")) return { error: "A valid email is required." };
  return { fields: { name, email } };
}

/** Map Better Auth / API errors into a short toast message. */
function errorMessage(error, fallback) {
  if (error instanceof APIError) {
    return error.body?.message || error.message || fallback;
  }
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message) || fallback;
  }
  return fallback;
}

export async function fetchUsersAction() {
  await requireAdmin();

  const result = await auth.api.listUsers({
    query: {
      limit: 200,
      sortBy: "createdAt",
      sortDirection: "desc",
    },
    headers: await headers(),
  });

  return result.users ?? [];
}

/**
 * Create an attendant account with a generated temporary password.
 * Returns the plaintext password once so the admin can hand it over.
 */
export async function createUserAction(formData) {
  await requireAdmin();

  const { error, fields } = readCreateForm(formData);
  if (error) return { error };

  const temporaryPassword = generateTemporaryPassword();

  try {
    const result = await auth.api.createUser({
      body: {
        name: fields.name,
        email: fields.email,
        password: temporaryPassword,
        role: "user",
        data: { mustChangePassword: true, emailVerified: true },
      },
      headers: await headers(),
    });

    revalidatePath("/admin/users");
    return {
      user: result.user,
      temporaryPassword,
    };
  } catch (err) {
    return { error: errorMessage(err, "Could not create the user.") };
  }
}

/**
 * Issue a fresh temporary password and force a change on next login.
 * Revokes existing sessions so the old password stops working immediately.
 */
export async function resetUserPasswordAction(userId) {
  await requireAdmin();

  const id = String(userId ?? "").trim();
  if (!id) return { error: "User is required." };

  const session = await requireAdmin();
  if (session.user.id === id) {
    return { error: "Use your own account menu to change your password." };
  }

  const temporaryPassword = generateTemporaryPassword();

  try {
    await auth.api.setUserPassword({
      body: { userId: id, newPassword: temporaryPassword },
      headers: await headers(),
    });
    await auth.api.adminUpdateUser({
      body: { userId: id, data: { mustChangePassword: true } },
      headers: await headers(),
    });
    await auth.api.revokeUserSessions({
      body: { userId: id },
      headers: await headers(),
    });

    revalidatePath("/admin/users");
    return { temporaryPassword };
  } catch (err) {
    return { error: errorMessage(err, "Could not reset the password.") };
  }
}

export async function removeUserAction(userId) {
  await requireAdmin();

  const id = String(userId ?? "").trim();
  if (!id) return { error: "User is required." };

  const session = await requireAdmin();
  if (session.user.id === id) {
    return { error: "You cannot delete your own account." };
  }

  try {
    await auth.api.removeUser({
      body: { userId: id },
      headers: await headers(),
    });
    revalidatePath("/admin/users");
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not delete the user.") };
  }
}

const ALLOWED_ROLES = new Set(["admin", "user"]);

/**
 * Assign admin or attendant role to an existing user.
 * Admins cannot change their own role (avoids locking themselves out).
 */
export async function setUserRoleAction(userId, role) {
  await requireAdmin();

  const id = String(userId ?? "").trim();
  const nextRole = String(role ?? "").trim();
  if (!id) return { error: "User is required." };
  if (!ALLOWED_ROLES.has(nextRole)) {
    return { error: "Role must be admin or attendant." };
  }

  const session = await requireAdmin();
  if (session.user.id === id) {
    return { error: "You cannot change your own role." };
  }

  try {
    await auth.api.setRole({
      body: { userId: id, role: nextRole },
      headers: await headers(),
    });

    // Demoting an admin: end their sessions so the old role stops applying.
    if (nextRole === "user") {
      await auth.api.revokeUserSessions({
        body: { userId: id },
        headers: await headers(),
      });
    }

    revalidatePath("/admin/users");
    return {};
  } catch (err) {
    return { error: errorMessage(err, "Could not update the role.") };
  }
}
