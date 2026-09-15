"use server";

import { revalidatePath } from "next/cache";

import { invalidatePerfCaches } from "@/lib/cache-tags";

import {
  getMonthInventorySummary,
  inventoryMonthKey,
  listInventoryHealth,
  listStockReceives,
  parseReceivedAt,
  receiveStock,
} from "@/lib/inventory";
import {
  cancelStockTransfer,
  confirmStockTransfer,
  getHubLocation,
  listLocationStockForLocation,
  listSellableLocations,
  listStockTransfers,
  sendStockTransfer,
} from "@/lib/locations";
import { requireAdmin } from "@/lib/session";
import { TRANSFER_STATUS } from "@/lib/stock-ledger";

function revalidateInventoryPaths() {
  invalidatePerfCaches();
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin/integrity");
  revalidatePath("/admin/dashboard");
  revalidatePath("/dashboard/inventory");
}

export async function fetchInventoryHealthAction() {
  await requireAdmin();
  return listInventoryHealth();
}

export async function fetchMonthInventoryAction(monthKey) {
  await requireAdmin();
  return getMonthInventorySummary(monthKey || inventoryMonthKey());
}

export async function fetchRecentReceivesAction(monthKey) {
  await requireAdmin();
  return listStockReceives({
    monthKey: monthKey || inventoryMonthKey(),
    limit: 25,
  });
}

export async function fetchSellableLocationsAction() {
  await requireAdmin();
  return listSellableLocations();
}

export async function fetchLocationStockAction(locationId) {
  await requireAdmin();
  if (!locationId) return [];
  return listLocationStockForLocation(locationId);
}

export async function fetchTransfersAction({ status = null, locationId = null } = {}) {
  await requireAdmin();
  return listStockTransfers({ status, locationId, limit: 50 });
}

export async function sendTransferAction(formData) {
  const session = await requireAdmin();
  const user = session.user;

  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const fromLocationId = String(formData.get("fromLocationId") ?? "").trim();
  const toLocationId = String(formData.get("toLocationId") ?? "").trim();
  const reason = String(formData.get("reason") ?? "").trim();

  const result = await sendStockTransfer({
    productId,
    quantity,
    fromLocationId,
    toLocationId,
    actor: { id: user.id, name: user.name },
    reason,
  });
  if (!result.ok) return { error: result.reason };

  revalidateInventoryPaths();
  return { transfer: result.transfer };
}

export async function confirmTransferAction(transferId) {
  const session = await requireAdmin();
  const result = await confirmStockTransfer({
    transferId,
    actor: { id: session.user.id, name: session.user.name },
  });
  if (!result.ok) return { error: result.reason };
  revalidateInventoryPaths();
  return { transfer: result.transfer };
}

export async function cancelTransferAction(transferId, reason = "") {
  const session = await requireAdmin();
  const result = await cancelStockTransfer({
    transferId,
    actor: { id: session.user.id, name: session.user.name },
    reason,
  });
  if (!result.ok) return { error: result.reason };
  revalidateInventoryPaths();
  return { transfer: result.transfer };
}

export async function receiveStockAction(formData) {
  const session = await requireAdmin();
  const user = session.user;

  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const reason = String(formData.get("reason") ?? "").trim();
  const receivedAtRaw = String(formData.get("receivedAt") ?? "").trim();
  const locationIdRaw = String(formData.get("locationId") ?? "").trim();

  const receivedAt = parseReceivedAt(receivedAtRaw || null);
  if (!receivedAt) {
    return { error: "Receive date and time must be valid." };
  }

  let locationId = locationIdRaw || null;
  if (!locationId) {
    const hub = await getHubLocation();
    locationId = hub?.id ?? null;
  }

  const result = await receiveStock({
    productId,
    quantity,
    reason,
    actor: { id: user.id, name: user.name },
    receivedAt,
    locationId,
  });

  if (!result.ok) return { error: result.reason };

  revalidateInventoryPaths();
  return { stock: result.stock };
}

export { TRANSFER_STATUS };
