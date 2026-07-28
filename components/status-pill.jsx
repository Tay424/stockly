import { cn } from "@/lib/utils";

const TONES = {
  danger: "bg-destructive/10 text-destructive",
  info: "bg-accent/15 text-primary",
  muted: "bg-secondary text-muted-foreground",
  success: "bg-primary/10 text-primary",
  warning: "bg-accent/20 text-[#8a5a1e]",
};

export function StatusPill({ children, className, tone = "muted" }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        TONES[tone] ?? TONES.muted,
        className,
      )}
    >
      {children}
    </span>
  );
}
