"use server";

import { revalidatePath } from "next/cache";

import { createCategory, deleteCategory, listCategories, updateCategory } from "@/lib/catalog";
import { parseMoneyToCents } from "@/lib/pricing";
import { requireAdmin } from "@/lib/session";

export async function fetchCategoriesAction() {
  await requireAdmin();
  return listCategories();
}

function readForm(formData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return { error: "Name is required." };

  const wholesalePackQty = Number(String(formData.get("wholesalePackQty") ?? "0").trim());
  if (!Number.isInteger(wholesalePackQty) || wholesalePackQty < 0) {
    return { error: "Wholesale pack quantity must be a whole number of 0 or more." };
  }

  const wholesalePackPriceRaw = String(formData.get("wholesalePackPrice") ?? "").trim();
  let wholesalePackPriceCents = 0;
  if (wholesalePackQty > 0) {
    const cents = parseMoneyToCents(wholesalePackPriceRaw === "" ? "0" : wholesalePackPriceRaw);
    if (cents === null) return { error: "Wholesale pack price must be a valid amount." };
    wholesalePackPriceCents = cents;
  } else if (wholesalePackPriceRaw !== "") {
    const cents = parseMoneyToCents(wholesalePackPriceRaw);
    if (cents === null) return { error: "Wholesale pack price must be a valid amount." };
    wholesalePackPriceCents = cents;
  }

  const retailPackQty = Number(String(formData.get("retailPackQty") ?? "0").trim());
  if (!Number.isInteger(retailPackQty) || retailPackQty < 0) {
    return { error: "Retail pack quantity must be a whole number of 0 or more." };
  }

  const retailPackPriceRaw = String(formData.get("retailPackPrice") ?? "").trim();
  let retailPackPriceCents = 0;
  if (retailPackQty > 0) {
    const cents = parseMoneyToCents(retailPackPriceRaw === "" ? "0" : retailPackPriceRaw);
    if (cents === null || cents <= 0) {
      return { error: "Retail pack price is required when retail pack quantity is set." };
    }
    retailPackPriceCents = cents;
  } else if (retailPackPriceRaw !== "") {
    const cents = parseMoneyToCents(retailPackPriceRaw);
    if (cents === null) return { error: "Retail pack price must be a valid amount." };
    retailPackPriceCents = cents;
  }

  if (retailPackQty > 0 && wholesalePackQty > 0 && wholesalePackQty % retailPackQty !== 0) {
    return {
      error: `Wholesale pack quantity (${wholesalePackQty}) must be a multiple of the retail pack (${retailPackQty}).`,
    };
  }

  return {
    fields: {
      name,
      description,
      wholesalePackQty,
      wholesalePackPriceCents,
      retailPackQty,
      retailPackPriceCents,
    },
  };
}

export async function saveCategoryAction(id, formData) {
  await requireAdmin();

  const { error, fields } = readForm(formData);
  if (error) return { error };

  if (id) {
    const ok = await updateCategory(id, fields);
    if (!ok) return { error: "Category not found." };
  } else {
    await createCategory(fields);
  }

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/dashboard/sales");
  revalidatePath("/admin/sales/backfill");
  return {};
}

export async function deleteCategoryAction(id) {
  await requireAdmin();

  const { ok, reason } = await deleteCategory(id);
  if (!ok) return { error: reason };

  revalidatePath("/admin/categories");
  return {};
}
