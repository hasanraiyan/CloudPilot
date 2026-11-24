"use client";

import {
  Activity,
  Bot,
  Box,
  ChevronLeft,
  ChevronRight,
  FolderKanban,
  Layers3,
  Logs,
  Rocket,
  Settings,
  Users,
  Variable,
  LayoutDashboard,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Brand } from "@/components/landing/brand";
import { useDashboard } from "./dashboard-provider";

const items = [
  ["overview", "Overview", LayoutDashboard],
  ["projects", "Projects", FolderKanban],
  ["deployments", "Deployments", Rocket],
  ["infrastructure", "Infrastructure", Layers3],
  ["monitoring", "Monitoring", Activity],
  ["logs", "Logs", Logs],
  ["ai-assistant", "AI Assistant", Bot],
  ["environment-variables", "Environment Variables", Variable],
  ["team", "Team", Users],
  ["settings", "Settings", Settings],
] as const;

export function DashboardSidebar({ mobile = false }: { mobile?: boolean }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { activeWorkspace } = useDashboard();

  return (
    <aside className={`${mobile ? "flex" : "hidden lg:flex"} ${collapsed && !mobile ? "w-[72px]" : "w-[240px]"} sticky top-0 h-screen shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-4 transition-[width] dark:border-zinc-800 dark:bg-zinc-950`}>
      <div className={`flex items-center ${collapsed && !mobile ? "justify-center" : "justify-between"} px-1`}>
        {(!collapsed || mobile) && <Brand compact />}
        {!mobile && (
          <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        )}
      </div>
      <div className="mt-5">
        <Link href="/dashboard/settings#workspaces" className="flex h-10 w-full items-center gap-2 rounded-lg border border-zinc-200 px-2.5 text-left text-xs dark:border-zinc-800">
          <span className="grid size-6 place-items-center rounded-md bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"><Box className="size-3" /></span>
          {(!collapsed || mobile) && <><span className="min-w-0 flex-1 truncate font-medium">{activeWorkspace?.name ?? "Workspace"}</span><span className="text-zinc-400">↗</span></>}
        </Link>
      </div>
      <nav aria-label="Dashboard navigation" className="mt-5 flex-1 space-y-1">
        {items.map(([slug, label, Icon]) => {
          const href = slug === "overview" ? "/dashboard" : `/dashboard/${slug}`;
          const active = pathname === href;
          return (
            <Link key={slug} href={href} title={collapsed && !mobile ? label : undefined} className={`flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-[12px] transition-colors ${active ? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-900 dark:text-white" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"} ${collapsed && !mobile ? "justify-center" : ""}`}>
              <Icon className="size-4 shrink-0" />
              {(!collapsed || mobile) && <span>{label}</span>}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
