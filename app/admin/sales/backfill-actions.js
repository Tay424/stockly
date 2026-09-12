"use server";

import { revalidatePath } from "next/cache";

import { listSellableProducts, recordSaleReceipt } from "@/lib/catalog";
import { listDistributors, normalizePhone } from "@/lib/distributors";
import {
  parseDatetimeLocal,
  validateBackfillSoldAt,
} from "@/lib/sales-backfill";
import { requireAdmin } from "@/lib/session";

export async function fetchBackfillProductsAction() {
  await requireAdmin();
  return listSellableProducts();
}

export async function fetchBackfillDistributorsAction() {
  await requireAdmin();
  return listDistributors({ limit: 300 });
}

/**
 * Admin-only: record a past sale with an explicit sold-at datetime.
 * Deducts current on-hand stock. Window: 22 Jul 2026 local → now.
 */
export async function recordPastSaleAction(cartLines, client, soldAtLocal) {
  const { user } = await requireAdmin();

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

  const parsed = parseDatetimeLocal(soldAtLocal);
  const validated = validateBackfillSoldAt(parsed);
  if (!validated.ok) return { error: validated.reason };

  let clientPayload = null;
  if (client) {
    const name = String(client.name ?? "").trim();
    const phone = normalizePhone(client.phone);
    if (!name && !phone) {
      clientPayload = null;
    } else if (!name && phone) {
      return { error: "Add a customer name when saving a phone number." };
    } else {
      clientPayload = { name, phone: phone || "" };
    }
  }

  const { ok, reason, totalCents, quantity, wholesale, saleId } =
    await recordSaleReceipt({
      cartLines: normalized,
      saleMeta: {
        soldBy: user.id,
        soldByName: user.name,
      },
      client: clientPayload,
      soldAt: validated.soldAt,
    });

  if (!ok) return { error: reason };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sales");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/sales/backfill");
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/integrity");
  revalidatePath("/admin/distributors");

  return { totalCents, quantity, wholesale, saleId };
}
