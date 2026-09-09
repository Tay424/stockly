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
        description="Wholesale clients in your network — performance from linked sales (voided excluded)."
      />
      <DistributorsTable initialDistributors={distributors} />
    </>
  );
}
