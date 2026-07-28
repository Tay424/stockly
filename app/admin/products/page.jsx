import { PageHeader } from "@/components/page-header";
import { listCategories, listProducts } from "@/lib/catalog";

import { ProductsTable } from "./products-table";

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([listProducts(), listCategories()]);

  return (
    <>
      <PageHeader
        title="Products"
        description="Retail and wholesale pricing, and the quantity where the price tier switches over."
      />
      <ProductsTable initialProducts={products} initialCategories={categories} />
    </>
  );
}
