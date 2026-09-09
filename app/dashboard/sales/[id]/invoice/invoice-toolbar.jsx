"use client";

import { useState } from "react";
import Link from "next/link";
import { PrinterIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

export function InvoiceToolbar({ saleId, shareText, backHref = "/dashboard/sales" }) {
  const [sharing, setSharing] = useState(false);

  async function onShare() {
    setSharing(true);
    const url = `${window.location.origin}/dashboard/sales/${saleId}/invoice`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: "Stockly invoice",
          text: shareText,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Invoice link copied.");
    } catch (err) {
      if (err?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Invoice link copied.");
      } catch {
        toast.error("Could not share. Copy the URL from the address bar.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="print:hidden mb-6 flex flex-wrap items-center gap-2 border-b border-border pb-4">
      <Button type="button" variant="outline" render={<Link href={backHref} />}>
        Back to Sales
      </Button>
      <Button type="button" variant="outline" onClick={() => window.print()}>
        <PrinterIcon className="size-4" />
        Print
      </Button>
      <Button type="button" onClick={onShare} disabled={sharing}>
        <Share2Icon className="size-4" />
        {sharing ? "Sharing…" : "Share"}
      </Button>
    </div>
  );
}
