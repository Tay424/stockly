"use server";

import { revalidatePath } from "next/cache";

import {
  createLocation,
  ensureLocationsMigrated,
  listSellableLocations,
  renameLocation,
  updateLocationCurrency,
} from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

export async function fetchLocationsAction() {
  await requireAdmin();
  await ensureLocationsMigrated();
  return listSellableLocations();
}

export async function createLocationAction(formData) {
  await requireAdmin();
  const result = await createLocation({
    name: formData.get("name"),
    currency: formData.get("currency"),
    role: formData.get("role"),
    supplyHubId: formData.get("supplyHubId"),
  });
  if (!result.ok) return { error: result.reason };
  revalidatePath("/admin/locations");
  revalidatePath("/admin/users");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/dashboard");
  return { location: result.location };
}

export async function updateLocationCurrencyAction(locationId, currency) {
  await requireAdmin();
  const result = await updateLocationCurrency(locationId, currency);
  if (!result.ok) return { error: result.reason };
  revalidatePath("/admin/locations");
  return { location: result.location };
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
