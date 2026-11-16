import { PageHeader } from "@/components/page-header";
import {
  ensureLocationsMigrated,
  listAttendantsGrouped,
  listSellableLocations,
} from "@/lib/locations";
import { requireAdmin } from "@/lib/session";

import { LocationsTable } from "./locations-table";

export default async function LocationsPage() {
  await requireAdmin();
  await ensureLocationsMigrated();
  const [locations, attendantsByLocation] = await Promise.all([
    listSellableLocations(),
    listAttendantsGrouped(),
  ]);

  return (
    <>
      <PageHeader
        title="Locations"
        description="Add a hub or branch, set its currency, and assign attendants on Users."
      />
      <LocationsTable
        initialLocations={locations}
        attendantsByLocation={attendantsByLocation}
      />
    </>
  );
}
