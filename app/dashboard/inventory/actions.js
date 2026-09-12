"use server";

import { revalidatePath } from "next/cache";

import { listProducts } from "@/lib/catalog";
import { listStockReceives, parseReceivedAt, receiveStock } from "@/lib/inventory";
import { requireUser } from "@/lib/session";

export async function fetchReceiveProductsAction() {
  await requireUser();
  const products = await listProducts();
  return products.map((p) => ({
    id: p.id,
    name: p.name,
    stock: p.stock ?? 0,
    categoryName: p.categoryName ?? null,
  }));
}

export async function fetchMyReceivesAction() {
  const session = await requireUser();
  return listStockReceives({ createdBy: session.user.id, limit: 20 });
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

  const result = await receiveStock({
    productId,
    quantity,
    reason,
    actor: { id: user.id, name: user.name },
    receivedAt,
  });

  if (!result.ok) return { error: result.reason };

  revalidatePath("/dashboard/inventory");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/products");
  revalidatePath("/admin/integrity");
  revalidatePath("/admin/dashboard");
  return { stock: result.stock };
}
