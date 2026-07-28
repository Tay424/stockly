"use server";

import { revalidatePath } from "next/cache";

import { createCategory, deleteCategory, listCategories, updateCategory } from "@/lib/catalog";
import { requireAdmin } from "@/lib/session";

export async function fetchCategoriesAction() {
  await requireAdmin();
  return listCategories();
}

function readForm(formData) {
  const name = String(formData.get("name") ?? "").trim();
  const description = String(formData.get("description") ?? "").trim();
  if (!name) return { error: "Name is required." };
  return { fields: { name, description } };
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
  return {};
}

export async function deleteCategoryAction(id) {
  await requireAdmin();

  const { ok, reason } = await deleteCategory(id);
  if (!ok) return { error: reason };

  revalidatePath("/admin/categories");
  return {};
}
