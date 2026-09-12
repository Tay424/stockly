import { notFound, redirect } from "next/navigation";

import { StatusPill } from "@/components/status-pill";
import { getSaleById } from "@/lib/catalog";
import { formatMoney } from "@/lib/pricing";
import { requireUser } from "@/lib/session";
import { SALE_STATUS } from "@/lib/stock-ledger";

import { InvoiceToolbar } from "./invoice-toolbar";

const dateFormatter = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

export default async function SaleInvoicePage({ params }) {
  const { user } = await requireUser();
  const { id } = await params;
  const sale = await getSaleById(id);
  if (!sale) notFound();
  if (user.role !== "admin" && sale.soldBy !== user.id) {
    redirect("/dashboard/sales");
  }

  const packs = Array.isArray(sale.packs) ? sale.packs : [];
  const retailLines = Array.isArray(sale.retailLines) ? sale.retailLines : [];
  const isLegacy = packs.length === 0 && retailLines.length === 0;
  const voided = sale.status === SALE_STATUS.voided;
  const shortId = String(sale.id).slice(-8).toUpperCase();
  const lineCount = (packs.length + retailLines.length) || (isLegacy ? 1 : 0);

  const shareText = [
    `Stockly receipt #${shortId}`,
    sale.clientName ? `Bill to: ${sale.clientName}` : null,
    `Total: ${formatMoney(sale.totalCents)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="receipt-shell min-h-[calc(100dvh-4rem)] bg-[radial-gradient(ellipse_at_top,_#f3e8dc_0%,_#fdfbf7_55%,_#f7f1ea_100%)] print:min-h-0 print:bg-white">
      <style>{`
        @page { margin: 12mm; }
        @media print {
          [data-slot="sidebar"],
          [data-slot="sidebar-wrapper"] > div:first-child,
          aside,
          header[data-slot="sidebar-header"],
          .print\\:hidden {
            display: none !important;
          }
          html, body { background: white !important; }
          main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
          .receipt-shell { background: white !important; padding: 0 !important; min-height: 0 !important; }
          .receipt-paper {
            box-shadow: none !important;
            border: none !important;
            max-width: none !important;
            border-radius: 0 !important;
          }
        }
      `}</style>

      <div className="mx-auto max-w-lg px-4 py-6 sm:px-6 sm:py-10">
        <InvoiceToolbar
          saleId={sale.id}
          shareText={shareText}
          backHref={user.role === "admin" ? "/admin/sales" : "/dashboard/sales"}
        />

        <article className="receipt-paper relative overflow-hidden rounded-3xl border border-[#e8ddd0] bg-[#fffdf9] shadow-[0_18px_50px_-24px_rgba(90,50,20,0.45)] print:rounded-none">
          <div className="bg-gradient-to-b from-primary/12 via-primary/5 to-transparent px-6 pb-2 pt-7 sm:px-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-3 flex size-12 items-center justify-center rounded-2xl bg-primary text-lg font-bold tracking-tight text-primary-foreground shadow-sm">
                S
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">Stockly</h1>
              <p className="mt-0.5 text-sm text-muted-foreground">Sale receipt</p>
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                <span className="rounded-full bg-background/80 px-2.5 py-0.5 font-mono text-[11px] tracking-wide text-muted-foreground ring-1 ring-border">
                  #{shortId}
                </span>
                {voided ? <StatusPill tone="danger">Voided</StatusPill> : null}
                {!voided && sale.wholesale ? (
                  <StatusPill tone="info">Wholesale</StatusPill>
                ) : null}
              </div>
            </div>
          </div>

          <div className="px-6 pb-8 sm:px-8">
            <dl className="mt-5 grid gap-2 rounded-2xl bg-[#f7f1ea]/70 px-4 py-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Date</dt>
                <dd className="font-medium text-foreground">
                  {sale.createdAt ? dateFormatter.format(new Date(sale.createdAt)) : "—"}
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-muted-foreground">Sold by</dt>
                <dd className="font-medium text-foreground">{sale.soldByName ?? "—"}</dd>
              </div>
              {sale.clientName || sale.clientPhone ? (
                <div className="flex items-start justify-between gap-3 border-t border-dashed border-[#e5d7c8] pt-2">
                  <dt className="text-muted-foreground">Bill to</dt>
                  <dd className="text-right">
                    <p className="font-medium text-foreground">{sale.clientName ?? "—"}</p>
                    {sale.clientPhone ? (
                      <p className="tabular-nums text-muted-foreground">{sale.clientPhone}</p>
                    ) : null}
                  </dd>
                </div>
              ) : null}
            </dl>

            {voided ? (
              <p className="mt-4 rounded-2xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                This sale was voided
                {sale.voidReason ? `: ${sale.voidReason}` : "."}
              </p>
            ) : null}

            <div className="mt-6">
              <div className="mb-2 flex items-center justify-between text-[11px] font-medium tracking-[0.14em] text-muted-foreground uppercase">
                <span>Item</span>
                <span>Amount</span>
              </div>
              <div className="border-t border-dashed border-[#e5d7c8]" />

              <ul className="divide-y divide-dashed divide-[#e5d7c8]">
                {packs.map((pack) => (
                  <li key={pack.categoryId ?? pack.categoryName} className="py-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-foreground">{pack.categoryName} pack</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Wholesale ×{pack.packCount}
                        </p>
                        {(pack.contributions ?? []).length > 0 ? (
                          <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
                            {pack.contributions.map((c) => (
                              <li key={c.productId}>
                                {c.productName} ×{c.quantity}
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </div>
                      <p className="shrink-0 font-semibold tabular-nums text-foreground">
                        {formatMoney(pack.totalCents)}
                      </p>
                    </div>
                  </li>
                ))}

                {retailLines.map((line) => (
                  <li
                    key={`retail-${line.productId}-${line.quantity}`}
                    className="flex items-start justify-between gap-3 py-3.5"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{line.productName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {formatMoney(line.unitPriceCents)} × {line.quantity} · retail
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-foreground">
                      {formatMoney(line.lineTotalCents)}
                    </p>
                  </li>
                ))}

                {isLegacy ? (
                  <li className="flex items-start justify-between gap-3 py-3.5">
                    <div className="min-w-0">
                      <p className="font-medium text-foreground">{sale.productName}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {sale.unitPriceCents != null
                          ? `${formatMoney(sale.unitPriceCents)} × ${sale.quantity}`
                          : `Qty ${sale.quantity}`}
                      </p>
                    </div>
                    <p className="shrink-0 font-semibold tabular-nums text-foreground">
                      {formatMoney(sale.totalCents)}
                    </p>
                  </li>
                ) : null}
              </ul>

              <div className="border-t border-dashed border-[#e5d7c8]" />
            </div>

            <div className="mt-5 rounded-2xl bg-primary px-4 py-4 text-primary-foreground shadow-sm">
              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-medium tracking-wide text-primary-foreground/75 uppercase">
                    Total paid
                  </p>
                  <p className="mt-0.5 text-sm text-primary-foreground/80">
                    {lineCount} line{lineCount === 1 ? "" : "s"}
                  </p>
                </div>
                <p className="text-2xl font-semibold tabular-nums tracking-tight">
                  {formatMoney(sale.totalCents)}
                </p>
              </div>
            </div>

            <p className="mt-6 text-center text-xs text-muted-foreground">
              Thank you for shopping with Stockly
            </p>
          </div>
        </article>
      </div>
    </div>
  );
}
