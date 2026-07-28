"use server";

import { monthlyAccounts } from "@/lib/finance";
import { requireAdmin } from "@/lib/session";

export async function fetchAccountsAction() {
  await requireAdmin();
  return monthlyAccounts();
}
