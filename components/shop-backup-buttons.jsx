import { ExportDataButton } from "@/components/export-data-button";
import { ImportDataButton } from "@/components/import-data-button";

export function ShopBackupButtons() {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <ImportDataButton />
      <ExportDataButton />
    </div>
  );
}
