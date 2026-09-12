"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeftIcon, PrinterIcon, Share2Icon } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function copyStylesInto(targetDoc) {
  for (const sheet of document.styleSheets) {
    try {
      const css = Array.from(sheet.cssRules, (rule) => rule.cssText).join("\n");
      const style = targetDoc.createElement("style");
      style.textContent = css;
      targetDoc.head.appendChild(style);
    } catch {
      if (sheet.href) {
        const link = targetDoc.createElement("link");
        link.rel = "stylesheet";
        link.href = sheet.href;
        targetDoc.head.appendChild(link);
      }
    }
  }
}

/** Print only the receipt paper in a blank document — no app chrome, no page URL. */
function printIsolatedReceipt(title) {
  const paper = document.querySelector("[data-invoice-paper]");
  if (!paper) {
    window.print();
    return;
  }

  const iframe = document.createElement("iframe");
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    window.print();
    return;
  }

  doc.open();
  doc.write(`<!DOCTYPE html>
<html class="${escapeHtml(document.documentElement.className)}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  @page { size: auto; margin: 0; }
  html, body {
    margin: 0 !important;
    padding: 0 !important;
    background: white !important;
  }
  body { padding: 12mm 14mm; }
  .receipt-paper {
    box-shadow: none !important;
    border: none !important;
    border-radius: 0 !important;
    max-width: none !important;
  }
</style>
</head>
<body>${paper.outerHTML}</body>
</html>`);
  doc.close();
  copyStylesInto(doc);

  const frameWindow = iframe.contentWindow;
  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    frameWindow?.removeEventListener("afterprint", cleanup);
    window.removeEventListener("focus", cleanup);
    iframe.remove();
  };

  const triggerPrint = () => {
    frameWindow?.addEventListener("afterprint", cleanup);
    window.addEventListener("focus", cleanup);
    frameWindow?.focus();
    frameWindow?.print();
  };

  const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"]'));
  Promise.all(
    links.map(
      (link) =>
        new Promise((resolve) => {
          if (link.sheet) {
            resolve();
            return;
          }
          link.addEventListener("load", resolve, { once: true });
          link.addEventListener("error", resolve, { once: true });
        }),
    ),
  ).then(() => {
    requestAnimationFrame(() => setTimeout(triggerPrint, 50));
  });
}

export function InvoiceToolbar({
  saleId,
  shareText,
  printTitle = "Receipt",
  backHref = "/dashboard/sales",
}) {
  const [sharing, setSharing] = useState(false);

  async function onShare() {
    setSharing(true);
    const url = `${window.location.origin}/dashboard/sales/${saleId}/invoice`;
    try {
      if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
        await navigator.share({
          title: printTitle,
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
        nativeButton={false}
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
          onClick={() => printIsolatedReceipt(printTitle)}
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
