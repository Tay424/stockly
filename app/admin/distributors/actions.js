"use server";

import { listDistributorPerformance } from "@/lib/distributors";
import { requireAdmin } from "@/lib/session";

export async function fetchDistributorPerformanceAction() {
  await requireAdmin();
  return listDistributorPerformance();
}
