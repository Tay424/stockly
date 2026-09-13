"use server";

import { revalidatePath } from "next/cache";

import {
  ensureLocationsMigrated,
  listSellableLocations,
  renameLocation,
} from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

export async function fetchLocationsAction() {
  await requireAdmin();
  await ensureLocationsMigrated();
  return listSellableLocations();
}

export async function renameLocationAction(locationId, name) {
  await requireAdmin();
  const result = await renameLocation(locationId, name);
  if (!result.ok) return { error: result.reason };

  revalidatePath("/admin/locations");
  revalidatePath("/admin/users");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/dashboard");
  return { location: result.location };
}
