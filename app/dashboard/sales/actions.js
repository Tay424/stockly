"use server";

import { revalidatePath } from "next/cache";

import {
  getSaleById,
  listSalesBySeller,
  listSellableProducts,
  recordSaleReceipt,
  requestSaleVoid,
} from "@/lib/catalog";
import { listDistributors, normalizePhone } from "@/lib/distributors";
import { requireUser } from "@/lib/session";

export async function fetchSellableProductsAction() {
  await requireUser();
  return listSellableProducts();
}

/** Attendant history: last 24 hours only. */
export async function fetchAllMySalesAction() {
  const { user } = await requireUser();
  return listSalesBySeller(user.id, 500, { sinceHours: 24 });
}

/** Light list for the wholesale client picker. */
export async function fetchDistributorsAction() {
  await requireUser();
  return listDistributors({ limit: 300 });
}

/**
 * Record a multi-line receipt. Prices and packs are recomputed server-side.
 * `cartLines`: [{ productId, quantity }]
 * `client`: { name, phone } — required (both) when the receipt has wholesale packs;
 * optional on retail (name only, or name+phone for CRM directory).
 */
export async function recordSaleReceiptAction(cartLines, client = null) {
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

  let clientPayload = null;
  if (client) {
    const name = String(client.name ?? "").trim();
    const phone = normalizePhone(client.phone);
    if (!name && !phone) {
      clientPayload = null;
    } else if (!name && phone) {
      return { error: "Add a customer name when saving a phone number." };
    } else {
      // Phone may be empty for retail name-only CRM snapshots.
      clientPayload = { name, phone: phone || "" };
    }
  }

  const { ok, reason, totalCents, quantity, wholesale, saleId } = await recordSaleReceipt({
    cartLines: normalized,
    saleMeta: {
      soldBy: user.id,
      soldByName: user.name,
    },
    client: clientPayload,
  });

  if (!ok) return { error: reason };

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sales");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/products");
  revalidatePath("/admin/integrity");
  revalidatePath("/admin/distributors");
  return { totalCents, quantity, wholesale, saleId };
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
  revalidatePath("/admin/distributors");
  return {};
}

/** Load a sale for invoice — own sale for attendants, any for admin. */
export async function loadSaleForInvoiceAction(saleId) {
  const { user } = await requireUser();
  const sale = await getSaleById(saleId);
  if (!sale) return { error: "Sale not found." };
  if (user.role !== "admin" && sale.soldBy !== user.id) {
    return { error: "You can only open invoices for your own sales." };
  }
  return { sale };
}
