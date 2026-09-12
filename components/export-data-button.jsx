"use client";

import { useState } from "react";
import { DownloadIcon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

function filenameFromDisposition(header, fallback) {
  const match = header && /filename="([^"]+)"/.exec(header);
  return match?.[1] || fallback;
}

export function ExportDataButton() {
  const [pending, setPending] = useState(false);

  async function onExport() {
    setPending(true);
    try {
      const res = await fetch("/api/admin/export");
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error || "Could not export data.");
        return;
      }

      const blob = await res.blob();
      const filename = filenameFromDisposition(
        res.headers.get("Content-Disposition"),
        "stockly-export.json",
      );
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Shop data downloaded.");
    } catch {
      toast.error("Could not export data.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Button type="button" variant="outline" onClick={onExport} disabled={pending}>
      <DownloadIcon />
      {pending ? "Exporting…" : "Export data"}
    </Button>
  );
}
