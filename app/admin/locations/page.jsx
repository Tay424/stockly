import { PageHeader } from "@/components/page-header";
import { ensureLocationsMigrated, listSellableLocations } from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

import { LocationsTable } from "./locations-table";

export default async function LocationsPage() {
  await requireAdmin();
  await ensureLocationsMigrated();
  const locations = await listSellableLocations();

  return (
    <>
      <PageHeader
        title="Locations"
        description="Harare hub and Gweru branch. Assign attendants on Users; move stock with Inventory transfers."
      />
      <LocationsTable initialLocations={locations} />
    </>
  );
}
