import { cn } from "@/lib/utils";

// Big light-weight number, small muted label, thin border. The hint line is
// always reserved so cards keep the same height across a row.
export function StatCard({ className, hint, label, value }) {
  return (
    <div className={cn("flex h-full flex-col rounded-lg border border-border bg-card p-5", className)}>
      <p className="text-3xl font-light tracking-tight text-foreground tabular-nums">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{label}</p>
      <p
        className={cn("mt-0.5 min-h-4 text-xs leading-4 text-muted-foreground/80", !hint && "invisible")}
        aria-hidden={!hint}
      >
        {hint ?? " "}
      </p>
    </div>
  );
}
