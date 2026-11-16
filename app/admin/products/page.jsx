import { PageHeader } from "@/components/page-header";
import { listCategories, listProducts } from "@/lib/catalog";
import { listPricesForLocations } from "@/lib/location-prices";
import { listSellableLocations } from "@/lib/locations";

import { ProductsTable } from "./products-table";

export default async function ProductsPage() {
  const [products, categories, locations] = await Promise.all([
    listProducts(),
    listCategories(),
    listSellableLocations(),
  ]);
  const priceLocations = locations.filter((location) => location.currency !== "USD");
  const locationPrices = await listPricesForLocations(priceLocations.map((location) => location.id));

  return (
    <>
      <PageHeader
        title="Products"
        description="USD prices stay on the product. Rand shops need their own retail price."
      />
      <ProductsTable
        initialProducts={products}
        initialCategories={categories}
        priceLocations={priceLocations}
        locationPrices={locationPrices}
      />
    </>
  );
}
