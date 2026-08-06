"use client";

import {
  ClipboardCheckIcon,
  LayersIcon,
  LayoutDashboardIcon,
  PackageIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ReceiptTextIcon,
  ScaleIcon,
  ShoppingCartIcon,
  UsersIcon,
  WalletIcon,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { ADMIN_NAV, USER_NAV } from "@/lib/nav";
import { cn } from "@/lib/utils";

const NAV_ICONS = {
  "/admin/dashboard": LayoutDashboardIcon,
  "/admin/products": PackageIcon,
  "/admin/categories": LayersIcon,
  "/admin/users": UsersIcon,
  "/admin/sales": ReceiptTextIcon,
  "/admin/integrity": ClipboardCheckIcon,
  "/admin/expenses": WalletIcon,
  "/admin/accounts": ScaleIcon,
  "/dashboard": ShoppingCartIcon,
  "/dashboard/sales": ReceiptTextIcon,
  "/dashboard/expenses": WalletIcon,
};

const NAV = {
  admin: ADMIN_NAV,
  user: USER_NAV,
};

function SidebarCollapseTrigger({ className }) {
  const { state, toggleSidebar } = useSidebar();
  const expanded = state === "expanded";
  const Icon = expanded ? PanelLeftCloseIcon : PanelLeftOpenIcon;

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggleSidebar}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
    >
      <Icon className="size-4" />
    </Button>
  );
}

export function AppSidebar({ role, badges = {} }) {
  const pathname = usePathname();
  const items = NAV[role] ?? [];

  // Longest match wins, so /dashboard/sales highlights Sales rather than both
  // it and its parent Dashboard.
  const activeHref = items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.href;

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <Link
          href="/"
          className="flex items-center gap-2.5 px-2 py-3 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
        >
          <PackageIcon className="size-6 shrink-0 text-primary" />
          <span className="truncate text-base font-light text-foreground group-data-[collapsible=icon]:hidden">
            Stockly
          </span>
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarMenu>
            {items.map((item) => {
              const Icon = NAV_ICONS[item.href];
              const badge = badges[item.href];
              return (
                <SidebarMenuItem key={item.href}>
                  <SidebarMenuButton
                    render={<Link href={item.href} />}
                    isActive={item.href === activeHref}
                    tooltip={item.label}
                  >
                    <Icon />
                    <span>{item.label}</span>
                  </SidebarMenuButton>
                  {badge ? <SidebarMenuBadge>{badge}</SidebarMenuBadge> : null}
                </SidebarMenuItem>
              );
            })}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter className="mt-auto border-t border-sidebar-border p-0">
        <div className="flex items-center justify-between px-3 py-2 group-data-[collapsible=icon]:justify-center">
          <span className="text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
            v0.1
          </span>
          <SidebarCollapseTrigger className="hidden md:inline-flex" />
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
