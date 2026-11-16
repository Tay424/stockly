import { PageHeader } from "@/components/page-header";
import { getTodayIntegrity } from "@/lib/catalog";
import { getTransferIntegritySnapshot, harareSourceSnapshot } from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

import { IntegrityView } from "./integrity-view";

export default async function IntegrityPage() {
  await requireAdmin();
  const [snapshot, transfers, inbound] = await Promise.all([
    getTodayIntegrity(),
    getTransferIntegritySnapshot(),
    harareSourceSnapshot(),
  ]);

  return (
    <>
      <PageHeader
        title="Integrity"
        description="Today’s stock movements versus sales, open transfers, and where Harare’s units came from."
      />
      <IntegrityView initialSnapshot={{ ...snapshot, transfers, inbound }} />
    </>
  );
}
