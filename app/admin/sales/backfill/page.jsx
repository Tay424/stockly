import Link from "next/link";

import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { listSellableProducts } from "@/lib/catalog";
import { requireAdmin } from "@/lib/session";

import { BackfillSaleForm } from "../backfill-form";

export default async function AdminSalesBackfillPage() {
  await requireAdmin();
  const products = await listSellableProducts();

  return (
    <>
      <PageHeader
        title="Record past sale"
        description="Enter paper sales from 22 July 2026 through today with the real date and time."
        action={
          <Button variant="outline" render={<Link href="/admin/sales" />}>
            All sales
          </Button>
        }
      />
      <BackfillSaleForm initialProducts={products} />
    </>
  );
}
