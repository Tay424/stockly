"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PrinterIcon, Share2Icon } from "lucide-react";
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
          title: "Stockly receipt",
          text: shareText,
          url,
        });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Receipt link copied.");
    } catch (err) {
      if (err?.name === "AbortError") return;
      try {
        await navigator.clipboard.writeText(url);
        toast.success("Receipt link copied.");
      } catch {
        toast.error("Could not share. Copy the URL from the address bar.");
      }
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="print:hidden mb-5 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="rounded-full bg-background/80 backdrop-blur"
        render={<Link href={backHref} />}
      >
        <ArrowLeftIcon className="size-4" />
        Sales
      </Button>
      <div className="ml-auto flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="rounded-full bg-background/80 backdrop-blur"
          onClick={() => window.print()}
        >
          <PrinterIcon className="size-4" />
          Print
        </Button>
        <Button
          type="button"
          size="sm"
          className="rounded-full"
          onClick={onShare}
          disabled={sharing}
        >
          <Share2Icon className="size-4" />
          {sharing ? "Sharing…" : "Share"}
        </Button>
      </div>
    </div>
  );
}
