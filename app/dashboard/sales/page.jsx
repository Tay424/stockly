import { PageHeader } from "@/components/page-header";
import { listSalesBySeller, listSellableProducts } from "@/lib/catalog";
import { requireUser } from "@/lib/session";

import { MySalesTable } from "./my-sales-table";
import { SellForm } from "./sell-form";

export default async function MySalesPage() {
  const { user } = await requireUser();
  const [products, sales] = await Promise.all([
    listSellableProducts(),
    listSalesBySeller(user.id, 500),
  ]);

  return (
    <>
      <PageHeader
        title="Sales"
        description="Open a receipt, add products by category, and confirm — stock updates automatically. Your history is below."
      />
      <div className="mb-8">
        <SellForm initialProducts={products} />
      </div>
      <MySalesTable initialSales={sales} />
    </>
  );
}
