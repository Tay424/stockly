import { PageHeader } from "@/components/page-header";
import { listProducts } from "@/lib/catalog";
import { listStockReceives } from "@/lib/inventory";
import {
  listLocationStockForLocation,
  requireUserLocation,
} from "@/lib/locations";
import { requireUser } from "@/lib/session";

import { AttendantInventoryView } from "./attendant-inventory-view";

export default async function AttendantInventoryPage() {
  const session = await requireUser();
  const loc = await requireUserLocation(session.user);

  const branchId = loc.ok ? loc.location.id : null;

  const [products, receives, branchStock] = await Promise.all([
    listProducts(),
    listStockReceives({ createdBy: session.user.id, limit: 20 }),
    branchId ? listLocationStockForLocation(branchId) : Promise.resolve([]),
  ]);

  const qtyByProduct = new Map(
    branchStock.map((row) => [row.productId, row.quantity]),
  );

  const productOptions = products.map((p) => ({
    id: p.id,
    name: p.name,
    stock: qtyByProduct.get(p.id) ?? 0,
    categoryName: p.categoryName ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Inventory"
        description="See stock on hand at your branch, receive deliveries, and manage Harare → Gweru transfers."
      />
      <AttendantInventoryView
        initialProducts={productOptions}
        initialReceives={receives}
        initialBranch={loc.ok ? loc.location : null}
        initialBranchStock={branchStock}
      />
    </>
  );
}
