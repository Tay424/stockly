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

  const shareText = [
    `Stockly invoice ${sale.id}`,
    sale.clientName ? `Bill to: ${sale.clientName}` : null,
    `Total: ${formatMoney(sale.totalCents)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <style>{`
        @media print {
          [data-slot="sidebar"],
          [data-slot="sidebar-wrapper"] > div:first-child,
          aside,
          header[data-slot="sidebar-header"],
          .print\\:hidden {
            display: none !important;
          }
          body { background: white !important; }
          main { padding: 0 !important; margin: 0 !important; max-width: none !important; }
        }
      `}</style>

      <InvoiceToolbar
        saleId={sale.id}
        shareText={shareText}
        backHref={user.role === "admin" ? "/admin/sales" : "/dashboard/sales"}
      />

      <article className="rounded-xl border border-border bg-card p-6 text-sm shadow-sm print:border-0 print:shadow-none">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-2xl font-semibold tracking-tight text-foreground">Stockly</p>
            <p className="text-muted-foreground">Sale invoice</p>
          </div>
          <div className="text-right text-muted-foreground">
            <p className="font-mono text-xs break-all">{sale.id}</p>
            <p>
              {sale.createdAt ? dateFormatter.format(new Date(sale.createdAt)) : "—"}
            </p>
            <p>Sold by {sale.soldByName ?? "—"}</p>
            {voided ? (
              <div className="mt-2 flex justify-end">
                <StatusPill tone="danger">Voided</StatusPill>
              </div>
            ) : sale.wholesale ? (
              <div className="mt-2 flex justify-end">
                <StatusPill tone="info">Wholesale</StatusPill>
              </div>
            ) : null}
          </div>
        </header>

        {sale.clientName || sale.clientPhone ? (
          <section className="mb-6">
            <h2 className="mb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Bill to
            </h2>
            <p className="font-medium text-foreground">{sale.clientName ?? "—"}</p>
            {sale.clientPhone ? (
              <p className="tabular-nums text-muted-foreground">{sale.clientPhone}</p>
            ) : null}
          </section>
        ) : null}

        {voided ? (
          <p className="mb-4 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-destructive">
            This sale was voided
            {sale.voidReason ? `: ${sale.voidReason}` : "."}
          </p>
        ) : null}

        <section className="grid gap-4">
          {packs.map((pack) => (
            <div key={pack.categoryId ?? pack.categoryName} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="font-medium">
                  {pack.categoryName} wholesale ×{pack.packCount}
                </p>
                <p className="tabular-nums font-medium">{formatMoney(pack.totalCents)}</p>
              </div>
              <ul className="space-y-0.5 text-xs text-muted-foreground">
                {(pack.contributions ?? []).map((c) => (
                  <li key={c.productId}>
                    {c.productName} ×{c.quantity}
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {retailLines.map((line) => (
            <div
              key={`retail-${line.productId}-${line.quantity}`}
              className="flex items-baseline justify-between gap-2"
            >
              <div>
                <p>
                  {line.productName} ×{line.quantity}
                </p>
                <p className="text-xs text-muted-foreground">
                  {formatMoney(line.unitPriceCents)} each · retail
                </p>
              </div>
              <p className="tabular-nums">{formatMoney(line.lineTotalCents)}</p>
            </div>
          ))}

          {isLegacy ? (
            <div className="flex items-baseline justify-between gap-2">
              <div>
                <p>
                  {sale.productName} ×{sale.quantity}
                </p>
                {sale.unitPriceCents != null ? (
                  <p className="text-xs text-muted-foreground">
                    {formatMoney(sale.unitPriceCents)} each
                  </p>
                ) : null}
              </div>
              <p className="tabular-nums">{formatMoney(sale.totalCents)}</p>
            </div>
          ) : null}
        </section>

        <footer className="mt-6 flex items-center justify-between border-t border-border pt-4 text-base">
          <span className="font-semibold">Total</span>
          <span className="font-semibold tabular-nums">{formatMoney(sale.totalCents)}</span>
        </footer>
      </article>
    </div>
  );
}
