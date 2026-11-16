import { PageHeader } from "@/components/page-header";
import { listCategories } from "@/lib/catalog";

import { CategoriesTable } from "./categories-table";

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <>
      <PageHeader
        title="Categories"
        description="Pack sizes are shared. Dollar and rand pack prices are each set once."
      />
      <CategoriesTable initialCategories={categories} />
    </>
  );
}
