import type { ReactNode } from "react";
import { DashboardSidebar } from "@/components/dashboard/sidebar";
import { DashboardProvider } from "@/components/dashboard/dashboard-provider";
import { AssistantProvider } from "@/components/assistant/assistant-provider";
import { AssistantShell } from "@/components/assistant/assistant-shell";

// The dashboard waits for the authenticated API session before rendering private content.
export const instant = false;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <DashboardProvider>
        <AssistantProvider>
          <div className="flex">
            <DashboardSidebar />
            <AssistantShell>{children}</AssistantShell>
          </div>
        </AssistantProvider>
      </DashboardProvider>
    </div>
  );
}
