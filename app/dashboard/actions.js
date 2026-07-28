"use server";

import { revalidatePath } from "next/cache";

import { findProductById, listSalesBySeller, listSellableProducts, recordSale } from "@/lib/catalog";
import { isDiscountActive, isWholesale, lineTotal, unitPriceFor } from "@/lib/pricing";
import { requireUser } from "@/lib/session";

export async function fetchSellableProductsAction() {
  await requireUser();
  return listSellableProducts();
}

export async function fetchMySalesAction() {
  const { user } = await requireUser();
  return listSalesBySeller(user.id);
}

export async function recordSaleAction(productId, quantity) {
  const { user } = await requireUser();

  const qty = Number(quantity);
  if (!Number.isInteger(qty) || qty < 1) {
    return { error: "Quantity must be a whole number of at least 1." };
  }

  // Price is always recomputed from the stored product — never trust a price
  // that came from the browser.
  const product = await findProductById(productId);
  if (!product) return { error: "Product not found." };

  const now = new Date();
  const unitPriceCents = unitPriceFor(product, qty, now);

  const { ok, reason, stockLeft } = await recordSale({
    productId,
    quantity: qty,
    sale: {
      productName: product.name,
      quantity: qty,
      unitPriceCents,
      totalCents: lineTotal(product, qty, now),
      wholesale: isWholesale(product, qty),
      discountPercent: isDiscountActive(product, now) ? product.discountPercent : 0,
      soldBy: user.id,
      soldByName: user.name,
    },
  });

  if (!ok) return { error: reason };

  revalidatePath("/dashboard");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/products");
  return { stockLeft };
}
