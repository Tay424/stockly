import { PageHeader } from "@/components/page-header";
import { listCategories, listProducts } from "@/lib/catalog";

import { ProductsTable } from "./products-table";

export default async function ProductsPage() {
  const [products, categories] = await Promise.all([listProducts(), listCategories()]);

  return (
    <>
      <PageHeader
        title="Products"
        description="One product for every shop. Dollar and rand prices are set once and shared by every shop in that currency."
      />
      <ProductsTable initialProducts={products} initialCategories={categories} />
    </>
  );
}
