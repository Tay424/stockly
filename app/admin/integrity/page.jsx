import { PageHeader } from "@/components/page-header";
import { getTodayIntegrity } from "@/lib/catalog";
import { getTransferIntegritySnapshot } from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

import { IntegrityView } from "./integrity-view";

export default async function IntegrityPage() {
  await requireAdmin();
  const [snapshot, transfers] = await Promise.all([
    getTodayIntegrity(),
    getTransferIntegritySnapshot(),
  ]);

  return (
    <>
      <PageHeader
        title="Integrity"
        description="Today’s stock movements versus sales, plus open Harare → Gweru transfers."
      />
      <IntegrityView initialSnapshot={{ ...snapshot, transfers }} />
    </>
  );
}
