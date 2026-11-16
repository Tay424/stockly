import { PageHeader } from "@/components/page-header";
import { listSalesBySeller, listSellableProducts } from "@/lib/catalog";
import { requireUserLocation } from "@/lib/locations";
import { requireUser } from "@/lib/session";

import { MySalesTable } from "./my-sales-table";
import { SellForm } from "./sell-form";

export default async function MySalesPage() {
  const { user } = await requireUser();
  const loc = await requireUserLocation(user);
  const locationId = loc.ok ? loc.location.id : null;
  const currency = loc.ok ? loc.location.currency || "USD" : "USD";
  const [products, sales] = await Promise.all([
    listSellableProducts({ locationId }),
    listSalesBySeller(user.id, 500, { sinceHours: 24 }),
  ]);

  return (
    <>
      <PageHeader
        title="Sales"
        description="Open a receipt, add products by category, and confirm — stock updates automatically. Your list shows sales from the last 24 hours only."
      />
      <div className="mb-8">
        <SellForm initialProducts={products} currency={currency} />
      </div>
      <MySalesTable initialSales={sales} />
    </>
  );
}
