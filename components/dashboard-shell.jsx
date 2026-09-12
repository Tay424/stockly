"use client";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";
import { MobileBottomNav } from "./mobile-bottom-nav";
import { PwaInstallTip } from "./pwa-install-tip";
import { UserAccountMenu } from "./user-account-menu";

export function DashboardShell({ children, role, user, badges }) {
  const attendant = role === "user";

  return (
    <SidebarProvider>
      <AppSidebar role={role} badges={badges} />
      <SidebarInset>
        <header
          data-app-chrome="header"
          className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur print:hidden md:h-16 md:px-6"
          style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
        >
          {/* Attendants use bottom nav on phones; keep sidebar trigger for admin. */}
          <SidebarTrigger
            className={
              attendant
                ? "hidden text-muted-foreground md:inline-flex"
                : "text-muted-foreground md:hidden"
            }
          />
          <div className="ml-auto flex items-center gap-1">
            <UserAccountMenu user={user} />
          </div>
        </header>
        <div
          className={
            attendant
              ? "flex-1 p-4 pb-24 print:p-0 md:p-8 md:pb-8"
              : "flex-1 p-4 print:p-0 md:p-8"
          }
        >
          {children}
        </div>
        {attendant ? (
          <>
            <MobileBottomNav role={role} />
            <PwaInstallTip elevated />
          </>
        ) : (
          <PwaInstallTip />
        )}
      </SidebarInset>
    </SidebarProvider>
  );
}
