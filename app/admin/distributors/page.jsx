import { PageHeader } from "@/components/page-header";
import { listDistributorPerformance } from "@/lib/distributors";
import { requireAdmin } from "@/lib/session";

import { DistributorsTable } from "./distributors-table";

export default async function DistributorsPage() {
  await requireAdmin();
  const distributors = await listDistributorPerformance();

  return (
    <>
      <PageHeader
        title="Distributors"
        description="Clients captured on sales (wholesale packs + optional retail CRM with phone) — performance from linked non-voided sales."
      />
      <DistributorsTable initialDistributors={distributors} />
    </>
  );
}
