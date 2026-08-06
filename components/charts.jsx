import { cn } from "@/lib/utils";

/**
 * Lightweight vertical bars — no chart library. Values are already aggregated.
 */
export function VerticalBarChart({
  className,
  data,
  emptyMessage = "No activity yet today.",
  formatValue,
  valueKey = "revenueCents",
}) {
  const max = Math.max(...data.map((row) => row[valueKey] ?? 0), 0);
  const hasData = max > 0;

  if (!hasData) {
    return (
      <p className="flex h-40 items-center justify-center text-sm text-muted-foreground">
        {emptyMessage}
      </p>
    );
  }

  return (
    <div className={cn("flex h-44 items-end gap-1 sm:gap-1.5", className)}>
      {data.map((row) => {
        const value = row[valueKey] ?? 0;
        const heightPct = Math.max((value / max) * 100, value > 0 ? 4 : 0);
        return (
          <div
            key={row.hour ?? row.label}
            className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1.5"
            title={`${row.label}: ${formatValue ? formatValue(value) : value}`}
          >
            <div className="flex h-36 w-full items-end">
              <div
                className={cn(
                  "w-full rounded-t-sm transition-[height]",
                  value > 0 ? "bg-primary/85" : "bg-secondary",
                )}
                style={{ height: `${heightPct}%` }}
              />
            </div>
            <span className="max-w-full truncate text-[10px] leading-none text-muted-foreground">
              {row.shortLabel ?? row.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Ranked horizontal bars — good for per-attendant breakdowns. */
export function HorizontalBarList({
  className,
  emptyMessage = "No sales recorded today.",
  formatValue,
  items,
  labelKey = "soldByName",
  valueKey = "revenueCents",
}) {
  const max = Math.max(...items.map((row) => row[valueKey] ?? 0), 0);

  if (max === 0 || items.length === 0) {
    return (
      <p className="px-4 py-10 text-center text-sm text-muted-foreground">{emptyMessage}</p>
    );
  }

  return (
    <ul className={cn("space-y-4 p-4", className)}>
      {items.map((row) => {
        const value = row[valueKey] ?? 0;
        const widthPct = (value / max) * 100;
        return (
          <li key={row.soldBy ?? row[labelKey]}>
            <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
              <span className="truncate font-medium text-foreground">{row[labelKey]}</span>
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {formatValue ? formatValue(value) : value}
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-chart-2"
                style={{ width: `${Math.max(widthPct, value > 0 ? 2 : 0)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {row.saleCount ?? 0} sales · {row.unitsSold ?? 0} units
            </p>
          </li>
        );
      })}
    </ul>
  );
}

export function ChartPanel({ children, description, title, action }) {
  return (
    <div className="overflow-hidden rounded-lg border border-border bg-card">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-medium text-foreground">{title}</h2>
          {description ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {action ?? null}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}
