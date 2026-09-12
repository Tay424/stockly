"use server";

import { revalidatePath } from "next/cache";

import { createProduct, deleteProduct, listProducts, updateProduct } from "@/lib/catalog";
import { parseMoneyToCents } from "@/lib/pricing";
import { storeProductImage } from "@/lib/receipts";
import { requireAdmin } from "@/lib/session";

export async function fetchProductsAction() {
  await requireAdmin();
  return listProducts();
}

/** "" -> null, otherwise a Date. Returns undefined when the value is unparseable. */
function readDate(value) {
  const raw = String(value ?? "").trim();
  if (raw === "") return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function readForm(formData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  const categoryId = String(formData.get("categoryId") ?? "").trim();
  const retailPriceCents = parseMoneyToCents(formData.get("retailPrice"));
  const stock = Number(formData.get("stock") ?? 0);
  const stockReason = String(formData.get("stockReason") ?? "").trim();
  const lowStockThreshold = Number(formData.get("lowStockThreshold") ?? 5);
  const discountPercent = Number(formData.get("discountPercent") ?? 0);
  const discountStartsAt = readDate(formData.get("discountStartsAt"));
  const discountEndsAt = readDate(formData.get("discountEndsAt"));

  if (!name) return { error: "Name is required." };
  if (!categoryId) return { error: "Pick a category." };
  if (retailPriceCents === null) return { error: "Retail price must be a valid amount." };
  if (!Number.isInteger(stock) || stock < 0) {
    return { error: "Stock must be a whole number." };
  }
  if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
    return { error: "Low stock threshold must be a whole number of 0 or more." };
  }
  if (!Number.isFinite(discountPercent) || discountPercent < 0 || discountPercent > 100) {
    return { error: "Discount must be between 0 and 100." };
  }
  if (discountStartsAt === undefined || discountEndsAt === undefined) {
    return { error: "Discount dates must be valid." };
  }
  if (discountPercent > 0 && !discountStartsAt) {
    return { error: "A discount needs a start date." };
  }
  if (discountStartsAt && discountEndsAt && discountEndsAt <= discountStartsAt) {
    return { error: "The discount must end after it starts." };
  }

  return {
    fields: {
      name,
      description,
      categoryId,
      retailPriceCents,
      stock,
      lowStockThreshold,
      // A 0% discount clears the window rather than leaving orphaned dates.
      discountPercent: discountPercent > 0 ? discountPercent : 0,
      discountStartsAt: discountPercent > 0 ? discountStartsAt : null,
      discountEndsAt: discountPercent > 0 ? discountEndsAt : null,
    },
    stockReason,
  };
}

function revalidateStockPaths() {
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  revalidatePath("/admin/integrity");
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sales");
}

export async function saveProductAction(id, formData) {
  const { user } = await requireAdmin();

  const { error, fields, stockReason } = readForm(formData);
  if (error) return { error };

  const file = formData.get("image");
  const hasNewFile =
    file && typeof file === "object" && "arrayBuffer" in file && Number(file.size) > 0;

  if (hasNewFile) {
    const stored = await storeProductImage(file);
    if (!stored.ok) return { error: stored.reason };
    if (stored.image) {
      fields.imageUrl = stored.image.url;
      fields.imageKey = stored.image.key;
      fields.imageMime = stored.image.mime;
      fields.imageName = stored.image.name;
    }
  }

  const actor = { id: user.id, name: user.name };

  if (id) {
    const result = await updateProduct(id, fields, { actor, stockReason });
    if (!result.ok) return { error: result.reason };
  } else {
    if (fields.stock > 0 && !stockReason) {
      return { error: "A reason is required when setting initial stock." };
    }
    if (!fields.imageUrl) {
      fields.imageUrl = null;
      fields.imageKey = null;
      fields.imageMime = null;
      fields.imageName = null;
    }
    await createProduct(fields, { actor, stockReason });
  }

  revalidateStockPaths();
  return {};
}

export async function deleteProductAction(id) {
  await requireAdmin();

  const ok = await deleteProduct(id);
  if (!ok) return { error: "Product not found." };

  revalidatePath("/admin/products");
  return {};
}
