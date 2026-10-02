"use server";

import { revalidatePath } from "next/cache";

import { createCategory, deleteCategory, listCategories, repriceNhavaSaltHistoricalSales, updateCategory } from "@/lib/catalog";
import { parseMoneyToCents } from "@/lib/pricing";
import { requireAdmin } from "@/lib/session";

export async function fetchCategoriesAction() {
  await requireAdmin();
  return listCategories();
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

  const promoWholesalePackQty = Number(
    String(formData.get("promoWholesalePackQty") ?? "0").trim(),
  );
  if (!Number.isInteger(promoWholesalePackQty) || promoWholesalePackQty < 0) {
    return { error: "Promo wholesale pack quantity must be a whole number of 0 or more." };
  }

  const promoPriceRaw = String(formData.get("promoWholesalePackPrice") ?? "").trim();
  let promoWholesalePackPriceCents = 0;
  const promoStartsAt = readDate(formData.get("promoStartsAt"));
  const promoEndsAt = readDate(formData.get("promoEndsAt"));

  if (promoStartsAt === undefined || promoEndsAt === undefined) {
    return { error: "Promo dates must be valid." };
  }

  if (promoWholesalePackQty > 0) {
    const cents = parseMoneyToCents(promoPriceRaw === "" ? "0" : promoPriceRaw);
    if (cents === null || cents <= 0) {
      return { error: "Promo pack price is required when a promo pack quantity is set." };
    }
    promoWholesalePackPriceCents = cents;

    if (!promoStartsAt || !promoEndsAt) {
      return { error: "A temporary wholesale promo needs both a start and an end date." };
    }
    if (promoEndsAt <= promoStartsAt) {
      return { error: "The promo must end after it starts." };
    }
    if (retailPackQty > 0 && promoWholesalePackQty % retailPackQty !== 0) {
      return {
        error: `Promo wholesale pack quantity (${promoWholesalePackQty}) must be a multiple of the retail pack (${retailPackQty}).`,
      };
    }
  } else if (promoPriceRaw !== "") {
    const cents = parseMoneyToCents(promoPriceRaw);
    if (cents === null) return { error: "Promo pack price must be a valid amount." };
    promoWholesalePackPriceCents = cents;
  }

  return {
    fields: {
      name,
      description,
      wholesalePackQty,
      wholesalePackPriceCents,
      retailPackQty,
      retailPackPriceCents,
      promoWholesalePackQty: promoWholesalePackQty > 0 ? promoWholesalePackQty : 0,
      promoWholesalePackPriceCents:
        promoWholesalePackQty > 0 ? promoWholesalePackPriceCents : 0,
      promoStartsAt: promoWholesalePackQty > 0 ? promoStartsAt : null,
      promoEndsAt: promoWholesalePackQty > 0 ? promoEndsAt : null,
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

export async function repriceNhavaSaltSalesAction(force = false) {
  await requireAdmin();
  const result = await repriceNhavaSaltHistoricalSales({ force: Boolean(force) });
  if (!result.ok) return { error: result.reason };

  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/admin/sales");
  revalidatePath("/dashboard/sales");
  return { result };
}
