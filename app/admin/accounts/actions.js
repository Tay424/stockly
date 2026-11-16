"use server";

import { monthlyAccounts } from "@/lib/finance";
import { requireAdmin } from "@/lib/session";

export async function fetchAccountsAction(currency = "USD") {
  await requireAdmin();
  return monthlyAccounts(currency === "ZAR" ? "ZAR" : "USD");
}
