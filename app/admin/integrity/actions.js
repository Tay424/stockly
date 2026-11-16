"use server";

import { getTodayIntegrity } from "@/lib/catalog";
import { getTransferIntegritySnapshot, harareSourceSnapshot } from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

export async function fetchIntegrityAction() {
  await requireAdmin();
  const [snapshot, transfers, inbound] = await Promise.all([
    getTodayIntegrity(),
    getTransferIntegritySnapshot(),
    harareSourceSnapshot(),
  ]);
  return { ...snapshot, transfers, inbound };
}
