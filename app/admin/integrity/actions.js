"use server";

import { getTodayIntegrity } from "@/lib/catalog";
import { requireAdmin } from "@/lib/session";

export async function fetchIntegrityAction() {
  await requireAdmin();
  return getTodayIntegrity();
}
