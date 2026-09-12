"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboardIcon, ReceiptTextIcon, WalletIcon } from "lucide-react";

import { USER_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const ICONS = {
  "/dashboard": LayoutDashboardIcon,
  "/dashboard/sales": ReceiptTextIcon,
  "/dashboard/expenses": WalletIcon,
};

/**
 * Thumb-friendly bottom nav for attendants on small screens.
 * Hidden from md+ (desktop keeps the sidebar).
 */
export function MobileBottomNav({ role }) {
  const pathname = usePathname();
  if (role !== "user") return null;

  const activeHref = USER_NAV.filter(
    (item) => pathname === item.href || pathname.startsWith(`${item.href}/`),
  ).sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <nav
      aria-label="Main"
      data-app-chrome="nav"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 backdrop-blur print:hidden md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="grid h-14 grid-cols-3">
        {USER_NAV.map((item) => {
          const Icon = ICONS[item.href] ?? LayoutDashboardIcon;
          const active = item.href === activeHref;
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-medium",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && "text-primary")} />
                <span>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
