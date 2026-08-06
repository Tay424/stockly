"use client";

import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

import { AppSidebar } from "./app-sidebar";
import { UserAccountMenu } from "./user-account-menu";

export function DashboardShell({ children, role, user, badges }) {
  return (
    <SidebarProvider>
      <AppSidebar role={role} badges={badges} />
      <SidebarInset>
        <header className="sticky top-0 z-10 flex h-16 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur md:px-6">
          <SidebarTrigger className="text-muted-foreground md:hidden" />
          <div className="ml-auto flex items-center gap-1">
            <UserAccountMenu user={user} />
          </div>
        </header>
        <div className="flex-1 p-4 md:p-8">{children}</div>
      </SidebarInset>
    </SidebarProvider>
  );
}
