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
import { useAssistantUi } from "@/components/assistant/assistant-provider";
import { useDashboard } from "./dashboard-provider";

const items = [
  ["overview", "Overview", LayoutDashboard],
  ["projects", "Projects", FolderKanban],
  ["deployments", "Deployments", Rocket],
  ["infrastructure", "Infrastructure", Layers3],
  ["monitoring", "Monitoring", Activity],
  ["logs", "Logs", Logs],
  ["environment-variables", "Environment Variables", Variable],
  ["team", "Team", Users],
  ["settings", "Settings", Settings],
] as const;

export function DashboardSidebar({ mobile = false, onNavigate }: { mobile?: boolean; onNavigate?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const { activeWorkspace } = useDashboard();
  const { isOpen, toggleOpen } = useAssistantUi();

  const compact = collapsed && !mobile;

  return (
    <aside className={`${mobile ? "flex" : "hidden lg:flex"} ${mobile ? "h-full w-full" : `sticky top-0 h-dvh ${compact ? "w-[64px]" : "w-[216px]"}`} min-h-0 shrink-0 flex-col border-r border-zinc-200 bg-white px-3 py-4 transition-[width] dark:border-zinc-800 dark:bg-zinc-950`}>
      <div className={`flex items-center ${collapsed && !mobile ? "justify-center" : "justify-between"} px-1`}>
        {(!collapsed || mobile) && <Brand compact />}
        {!mobile && (
          <button type="button" onClick={() => setCollapsed((value) => !value)} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"} className="grid size-8 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
            {collapsed ? <ChevronRight className="size-4" /> : <ChevronLeft className="size-4" />}
          </button>
        )}
      </div>
      <div className="mt-4 shrink-0">
        <Link href="/dashboard/settings#workspaces" onClick={onNavigate} aria-label={`Workspace settings for ${activeWorkspace?.name ?? "current workspace"}`} className={`flex h-10 w-full items-center gap-2 rounded-lg border border-zinc-200 text-left text-xs dark:border-zinc-800 ${compact ? "justify-center" : "px-2.5"}`}>
          <span className="grid size-6 shrink-0 place-items-center rounded-md bg-zinc-950 text-white dark:bg-white dark:text-zinc-950"><Box className="size-3" /></span>
          {(!collapsed || mobile) && <><span className="min-w-0 flex-1 truncate font-medium">{activeWorkspace?.name ?? "Workspace"}</span><span className="text-zinc-400">↗</span></>}
        </Link>
      </div>
      <nav aria-label="Dashboard navigation" className="mt-4 min-h-0 flex-1 space-y-1 overflow-y-auto overscroll-contain">
        {items.map(([slug, label, Icon]) => {
          const href = slug === "overview" ? "/dashboard" : `/dashboard/${slug}`;
          const active = pathname === href || (slug === "projects" && pathname.startsWith("/dashboard/projects/"));
          return (
            <Link key={slug} href={href} onClick={onNavigate} aria-label={label} aria-current={active ? "page" : undefined} title={collapsed && !mobile ? label : undefined} className={`flex min-h-9 items-center gap-2.5 rounded-lg px-2.5 py-1 text-[12px] transition-colors ${active ? "bg-zinc-100 font-medium text-zinc-950 dark:bg-zinc-900 dark:text-white" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"} ${collapsed && !mobile ? "justify-center" : ""}`}>
              <Icon className="size-4 shrink-0" />
              {(!collapsed || mobile) && <span className="min-w-0 [overflow-wrap:anywhere]">{label}</span>}
            </Link>
          );
        })}
      </nav>
      <div className="mt-3 shrink-0 border-t border-zinc-200 pt-3 dark:border-zinc-800">
        <button
          type="button"
          onClick={() => {
            toggleOpen();
            onNavigate?.();
          }}
          aria-label={isOpen ? "Hide AI Assistant" : "Open AI Assistant"}
          title={compact ? "AI Assistant" : undefined}
          className={`flex min-h-9 w-full items-center gap-2.5 rounded-lg px-2.5 py-1 text-[12px] transition-colors ${
            isOpen
              ? "bg-zinc-950 font-medium text-white dark:bg-white dark:text-zinc-950"
              : "text-zinc-600 hover:bg-zinc-100 hover:text-zinc-950 dark:text-zinc-400 dark:hover:bg-zinc-900 dark:hover:text-white"
          } ${compact ? "justify-center" : ""}`}
        >
          <Bot className="size-4 shrink-0" />
          {(!collapsed || mobile) && <span className="min-w-0 truncate">Ask Assistant</span>}
        </button>
      </div>
    </aside>
  );
}
