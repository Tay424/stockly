import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listSales } from "@/lib/catalog";

import { SalesTable } from "./sales-table";

export default async function SalesPage() {
  const sales = await listSales();

  return (
    <>
      <PageHeader
        title="Sales"
        description="Every sale recorded by your team."
        action={
          <Button render={<Link href="/admin/sales/backfill" />}>
            Record past sale
          </Button>
        }
      />
      <SalesTable initialSales={sales} />
    </>
  );
}
