"use server";

import { listSales } from "@/lib/catalog";
import { requireAdmin } from "@/lib/session";

export async function fetchSalesAction() {
  await requireAdmin();
  return listSales();
}
