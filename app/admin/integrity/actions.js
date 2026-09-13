"use server";

import { getTodayIntegrity } from "@/lib/catalog";
import { getTransferIntegritySnapshot } from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

export async function fetchIntegrityAction() {
  await requireAdmin();
  const [snapshot, transfers] = await Promise.all([
    getTodayIntegrity(),
    getTransferIntegritySnapshot(),
  ]);
  return { ...snapshot, transfers };
}
