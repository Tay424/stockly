import { PageHeader } from "@/components/page-header";
import { listCategories } from "@/lib/catalog";
import { listPricesForLocations } from "@/lib/location-prices";
import { listSellableLocations } from "@/lib/locations";

import { CategoriesTable } from "./categories-table";

export default async function CategoriesPage() {
  const [categories, locations] = await Promise.all([
    listCategories(),
    listSellableLocations(),
  ]);
  const priceLocations = locations.filter((location) => location.currency !== "USD");
  const locationPrices = await listPricesForLocations(priceLocations.map((location) => location.id));

  return (
    <>
      <PageHeader
        title="Categories"
        description="USD pack prices stay here. Rand shops set their own pack prices."
      />
      <CategoriesTable
        initialCategories={categories}
        priceLocations={priceLocations}
        locationPrices={locationPrices}
      />
    </>
  );
}
