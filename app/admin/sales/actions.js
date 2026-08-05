"use server";

import { revalidatePath } from "next/cache";

import {
  executeSaleVoid,
  listPendingVoidRequests,
  listSales,
} from "@/lib/catalog";
import { requireAdmin } from "@/lib/session";

function revalidateSalePaths() {
  revalidatePath("/dashboard");
  revalidatePath("/dashboard/sales");
  revalidatePath("/admin/sales");
  revalidatePath("/admin/products");
  revalidatePath("/admin/integrity");
  revalidatePath("/admin/dashboard");
  revalidatePath("/admin/accounts");
}

export async function fetchSalesAction() {
  await requireAdmin();
  return listSales();
}

export async function fetchPendingVoidRequestsAction() {
  await requireAdmin();
  return listPendingVoidRequests();
}

export async function executeVoidAction(saleId, reason) {
  const { user } = await requireAdmin();
  const { ok, reason: error } = await executeSaleVoid({
    saleId,
    adminId: user.id,
    adminName: user.name,
    reason,
  });
  if (!ok) return { error };
  revalidateSalePaths();
  return {};
}
