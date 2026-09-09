"use server";

import { revalidatePath } from "next/cache";

import {
  listSalesBySeller,
  listSellableProducts,
  recordSaleReceipt,
  requestSaleVoid,
} from "@/lib/catalog";
import { requireUser } from "@/lib/session";

export async function fetchSellableProductsAction() {
  await requireUser();
  return listSellableProducts();
}

export async function fetchAllMySalesAction() {
  const { user } = await requireUser();
  return listSalesBySeller(user.id, 500);
}

/**
 * Record a multi-line receipt. Prices and packs are recomputed server-side.
 * `cartLines`: [{ productId, quantity }]
 */
export async function recordSaleReceiptAction(cartLines) {
  const { user } = await requireUser();

  if (!Array.isArray(cartLines) || cartLines.length === 0) {
    return { error: "Add at least one product to the receipt." };
  }

  const normalized = [];
  for (const line of cartLines) {
    const productId = String(line?.productId ?? "").trim();
    const quantity = Number(line?.quantity);
    if (!productId) return { error: "Each line needs a product." };
    if (!Number.isInteger(quantity) || quantity < 1) {
      return { error: "Quantity must be a whole number of at least 1." };
    }
    normalized.push({ productId, quantity });
  }

  const { ok, reason, totalCents, quantity, wholesale } = await recordSaleReceipt({
    cartLines: normalized,
    saleMeta: {
      soldBy: user.id,
      soldByName: user.name,
    },
  });

  if (!ok) return { error: reason };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sales");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/products");
  revalidatePath("/admin/integrity");
  return { totalCents, quantity, wholesale };
}

export async function requestVoidAction(saleId, reason) {
  const { user } = await requireUser();
  const { ok, reason: error } = await requestSaleVoid({
    saleId,
    userId: user.id,
    userName: user.name,
    reason,
  });
  if (!ok) return { error };

  revalidatePath("/dashboard/sales");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/integrity");
  return {};
}
