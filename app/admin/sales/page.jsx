import { PageHeader } from "@/components/page-header";
import { listSales } from "@/lib/catalog";

import { SalesTable } from "./sales-table";

export default async function SalesPage() {
  const sales = await listSales();

  return (
    <>
      <PageHeader title="Sales" description="Every sale recorded by your team." />
      <SalesTable initialSales={sales} />
    </>
  );
}
