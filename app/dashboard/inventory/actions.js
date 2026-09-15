"use server";

import { revalidatePath } from "next/cache";

import { invalidatePerfCaches } from "@/lib/cache-tags";

import { listProducts } from "@/lib/catalog";
import { listStockReceives, parseReceivedAt, receiveStock } from "@/lib/inventory";
import {
  cancelStockTransfer,
  confirmStockTransfer,
  listLocationStockForLocation,
  listOpenTransfersTo,
  listSellableLocations,
  listStockTransfers,
  requireUserLocation,
  sendStockTransfer,
} from "@/lib/locations";
import { requireUser } from "@/lib/session";

function revalidateInventoryPaths() {
  invalidatePerfCaches();
  revalidatePath("/dashboard/inventory");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin/integrity");
  revalidatePath("/admin/dashboard");
}

async function productsWithBranchStock(locationId) {
  const [products, branchStock] = await Promise.all([
    listProducts(),
    listLocationStockForLocation(locationId),
  ]);
  const qtyByProduct = new Map(
    branchStock.map((row) => [row.productId, row.quantity]),
  );
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    stock: qtyByProduct.get(p.id) ?? 0,
    categoryName: p.categoryName ?? null,
  }));
}

export async function fetchReceiveProductsAction() {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);
  if (!loc.ok) return [];
  return productsWithBranchStock(loc.location.id);
}

/** Branch on-hand for the signed-in attendant only (no client location id). */
export async function fetchMyBranchStockAction() {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);
  if (!loc.ok) return [];
  return listLocationStockForLocation(loc.location.id);
}

export async function fetchMyReceivesAction() {
  const session = await requireUser();
  return listStockReceives({ createdBy: session.user.id, limit: 20 });
}

export async function fetchMyBranchAction() {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);
  if (!loc.ok) return { error: loc.reason, location: null };
  return { location: loc.location };
}

export async function fetchTransfersAction() {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);
  if (!loc.ok) return { error: loc.reason, transfers: [], openIncoming: [] };

  const [transfers, openIncoming] = await Promise.all([
    listStockTransfers({ locationId: loc.location.id, limit: 40 }),
    listOpenTransfersTo(loc.location.id),
  ]);
  return { transfers, openIncoming, location: loc.location };
}

export async function sendTransferAction(formData) {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);
  if (!loc.ok) return { error: loc.reason };
  if (!loc.location.isHub) {
    return { error: "Only Harare (hub) attendants can send stock to Gweru." };
  }

  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const reason = String(formData.get("reason") ?? "").trim();

  const branches = await listSellableLocations();
  const destination = branches.find((b) => !b.isHub);
  if (!destination) return { error: "Gweru branch is not set up yet." };

  const result = await sendStockTransfer({
    productId,
    quantity,
    fromLocationId: loc.location.id,
    toLocationId: destination.id,
    actor: { id: session.user.id, name: session.user.name },
    reason: reason || `Transfer to ${destination.name}`,
  });
  if (!result.ok) return { error: result.reason };

  revalidateInventoryPaths();
  return { transfer: result.transfer };
}

export async function confirmTransferAction(transferId) {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);
  if (!loc.ok) return { error: loc.reason };

  const open = await listOpenTransfersTo(loc.location.id);
  if (!open.some((t) => t.id === String(transferId))) {
    return { error: "That transfer is not waiting at your branch." };
  }

  const result = await confirmStockTransfer({
    transferId,
    actor: { id: session.user.id, name: session.user.name },
  });
  if (!result.ok) return { error: result.reason };

  revalidateInventoryPaths();
  return { transfer: result.transfer };
}

export async function cancelTransferAction(transferId, reason = "") {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);
  if (!loc.ok) return { error: loc.reason };
  if (!loc.location.isHub) {
    return { error: "Only hub staff can cancel an outgoing transfer." };
  }

  const result = await cancelStockTransfer({
    transferId,
    actor: { id: session.user.id, name: session.user.name },
    reason,
  });
  if (!result.ok) return { error: result.reason };

  revalidateInventoryPaths();
  return { transfer: result.transfer };
}

export async function receiveStockAsAttendantAction(formData) {
  const session = await requireUser();
  const user = session.user;

  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const reason = String(formData.get("reason") ?? "").trim();
  const receivedAtRaw = String(formData.get("receivedAt") ?? "").trim();

  const receivedAt = parseReceivedAt(receivedAtRaw || null);
  if (!receivedAt) {
    return { error: "Receive date and time must be valid." };
  }

  const loc = await requireUserLocation(user);
  if (!loc.ok) return { error: loc.reason };

  const result = await receiveStock({
    productId,
    quantity,
    reason,
    actor: { id: user.id, name: user.name },
    receivedAt,
    locationId: loc.location.id,
  });

  if (!result.ok) return { error: result.reason };

  revalidateInventoryPaths();
  return { stock: result.stock };
}
