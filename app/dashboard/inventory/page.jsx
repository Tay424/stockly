import { PageHeader } from "@/components/page-header";
import { listProducts } from "@/lib/catalog";
import { listStockReceives } from "@/lib/inventory";
import { requireUserLocation } from "@/lib/locations";
import { requireUser } from "@/lib/session";

import { AttendantInventoryView } from "./attendant-inventory-view";

export default async function AttendantInventoryPage() {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);

  const [products, receives] = await Promise.all([
    listProducts(),
    listStockReceives({ createdBy: session.user.id, limit: 20 }),
  ]);

  const productOptions = products.map((p) => ({
    id: p.id,
    name: p.name,
    stock: p.stock ?? 0,
    categoryName: p.categoryName ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Inventory"
        description="Receive stock into your branch and manage Harare → Gweru transfers."
      />
      <AttendantInventoryView
        initialProducts={productOptions}
        initialReceives={receives}
        initialBranch={loc.ok ? loc.location : null}
      />
    </>
  );
}
