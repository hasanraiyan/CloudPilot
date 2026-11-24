import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardProvider } from "@/components/dashboard/dashboard-provider";

// The dashboard waits for the authenticated API session before rendering private content.
export const instant = false;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <DashboardProvider><div className="flex"><DashboardSidebar /><div className="min-w-0 flex-1">{children}</div></div></DashboardProvider>
    </div>
  );
}
