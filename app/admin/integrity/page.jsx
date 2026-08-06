import { PageHeader } from "@/components/page-header";
import { getTodayIntegrity } from "@/lib/catalog";

import { IntegrityView } from "./integrity-view";

export default async function IntegrityPage() {
  const snapshot = await getTodayIntegrity();

  return (
    <>
      <PageHeader
        title="Integrity"
        description="Today’s stock movements versus sales — discrepancies are highlighted so nothing is left unaccounted for."
      />
      <IntegrityView initialSnapshot={snapshot} />
    </>
  );
}
