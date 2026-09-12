"use server";

import { revalidatePath } from "next/cache";

import {
  getMonthInventorySummary,
  inventoryMonthKey,
  listInventoryHealth,
  receiveStock,
} from "@/lib/inventory";
import { requireAdmin } from "@/lib/session";

export async function fetchInventoryHealthAction() {
  await requireAdmin();
  return listInventoryHealth();
}

export async function fetchMonthInventoryAction(monthKey) {
  await requireAdmin();
  return getMonthInventorySummary(monthKey || inventoryMonthKey());
}

export async function receiveStockAction(formData) {
  const session = await requireAdmin();
  const user = session.user;

  const productId = String(formData.get("productId") ?? "").trim();
  const quantity = Number(formData.get("quantity"));
  const reason = String(formData.get("reason") ?? "").trim();
  const receivedAtRaw = String(formData.get("receivedAt") ?? "").trim();

  let receivedAt = new Date();
  if (receivedAtRaw) {
    const parsed = new Date(`${receivedAtRaw}T12:00:00`);
    if (Number.isNaN(parsed.getTime())) {
      return { error: "Receive date must be valid." };
    }
    receivedAt = parsed;
  }

  const result = await receiveStock({
    productId,
    quantity,
    reason,
    actor: { id: user.id, name: user.name },
    receivedAt,
  });

  if (!result.ok) return { error: result.reason };

  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin/integrity");
  revalidatePath("/admin/dashboard");
  return { stock: result.stock };
}
