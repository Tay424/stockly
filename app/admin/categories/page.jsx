import { PageHeader } from "@/components/page-header";
import { listCategories } from "@/lib/catalog";

import { CategoriesTable } from "./categories-table";

export default async function CategoriesPage() {
  const categories = await listCategories();

  return (
    <>
      <PageHeader
        title="Categories"
        description="Group your products so they are easier to find."
      />
      <CategoriesTable initialCategories={categories} />
    </>
  );
}
