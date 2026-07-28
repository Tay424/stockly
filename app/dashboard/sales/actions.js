"use server";

import { listSalesBySeller } from "@/lib/catalog";
import { requireUser } from "@/lib/session";

export async function fetchAllMySalesAction() {
  const { user } = await requireUser();
  return listSalesBySeller(user.id, 500);
}
