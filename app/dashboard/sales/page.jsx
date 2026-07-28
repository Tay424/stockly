import { PageHeader } from "@/components/page-header";
import { listSalesBySeller } from "@/lib/catalog";
import { requireUser } from "@/lib/session";

import { MySalesTable } from "./my-sales-table";

export default async function MySalesPage() {
  const { user } = await requireUser();
  const sales = await listSalesBySeller(user.id, 500);

  return (
    <>
      <PageHeader title="Sales" description="Every sale you have recorded." />
      <MySalesTable initialSales={sales} />
    </>
  );
}
