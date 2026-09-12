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

  const packQtyRaw = String(formData.get("wholesalePackQty") ?? "0").trim();
  const wholesalePackQty = Number(packQtyRaw);
  if (!Number.isInteger(wholesalePackQty) || wholesalePackQty < 0) {
    return { error: "Pack quantity must be a whole number of 0 or more." };
  }

  const packPriceRaw = String(formData.get("wholesalePackPrice") ?? "").trim();
  let wholesalePackPriceCents = 0;
  if (wholesalePackQty > 0) {
    const cents = parseMoneyToCents(packPriceRaw === "" ? "0" : packPriceRaw);
    if (cents === null) return { error: "Pack price must be a valid amount." };
    wholesalePackPriceCents = cents;
  } else if (packPriceRaw !== "") {
    const cents = parseMoneyToCents(packPriceRaw);
    if (cents === null) return { error: "Pack price must be a valid amount." };
    wholesalePackPriceCents = cents;
  }

  return {
    fields: {
      name,
      description,
      wholesalePackQty,
      wholesalePackPriceCents,
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
  return {};
}

export async function deleteCategoryAction(id) {
  await requireAdmin();

  const { ok, reason } = await deleteCategory(id);
  if (!ok) return { error: reason };

  revalidatePath("/admin/categories");
  return {};
}
