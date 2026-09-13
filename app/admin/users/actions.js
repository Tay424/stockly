"use server";

import { APIError } from "better-auth/api";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { auth } from "@/lib/auth";
import {
  assignUserLocation,
  ensureLocationsMigrated,
  getHubLocation,
  listSellableLocations,
} from "@/lib/locations";
import { generateTemporaryPassword } from "@/lib/password";
import { requireAdmin } from "@/lib/session";

function readCreateForm(formData) {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const roleRaw = String(formData.get("role") ?? "user").trim();
  const role = roleRaw === "admin" ? "admin" : "user";
  const locationId = String(formData.get("locationId") ?? "").trim() || null;
  if (!name) return { error: "Name is required." };
  if (!email || !email.includes("@")) return { error: "A valid email is required." };
  return { fields: { name, email, role, locationId } };
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

export async function fetchSellableLocationsAction() {
  await requireAdmin();
  await ensureLocationsMigrated();
  return listSellableLocations();
}

/** Assign an attendant (or any user) to Harare or Gweru. */
export async function assignUserLocationAction(userId, locationId) {
  await requireAdmin();
  const id = String(userId ?? "").trim();
  if (!id) return { error: "User is required." };

  const result = await assignUserLocation(id, locationId);
  if (!result.ok) return { error: result.reason };

  revalidatePath("/admin/users");
  return { location: result.location };
}

/**
 * Create an attendant or admin account with a generated temporary password.
 * Returns the plaintext password once so the admin can hand it over.
 * Attendants default to the Harare hub when no locationId is provided.
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
        role: fields.role,
        data: { mustChangePassword: true, emailVerified: true },
      },
      headers: await headers(),
    });

    if (fields.role === "user" && result.user?.id) {
      let locationId = fields.locationId;
      if (!locationId) {
        const hub = await getHubLocation();
        locationId = hub?.id ?? null;
      }
      if (locationId) {
        const assigned = await assignUserLocation(result.user.id, locationId);
        if (!assigned.ok) {
          revalidatePath("/admin/users");
          return {
            user: result.user,
            temporaryPassword,
            warning: assigned.reason || "User created but branch assignment failed.",
          };
        }
      }
    }

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
