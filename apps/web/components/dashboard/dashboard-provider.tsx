"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

export type DashboardUser = { id: string; email: string; name: string | null; imageUrl: string | null; createdAt: string; providers: string[] };
export type Workspace = { id: string; name: string; slug: string; role: string };
type ContextValue = { user: DashboardUser | null; workspaces: Workspace[]; activeWorkspace: Workspace | null; loading: boolean; switchWorkspace: (id: string) => Promise<void>; refresh: () => Promise<void> };
const DashboardContext = createContext<ContextValue | null>(null);

export function DashboardProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<DashboardUser | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const [profile, result] = await Promise.all([apiFetch<DashboardUser>("/auth/me"), apiFetch<{ workspaces: Workspace[]; activeWorkspaceId: string | null }>("/workspaces")]);
      setUser(profile); setWorkspaces(result.workspaces); setActiveId(result.activeWorkspaceId);
    } catch { router.replace("/login"); }
    finally { setLoading(false); }
  }, [router]);
  useEffect(() => { const timer = window.setTimeout(() => { void refresh(); }, 0); return () => window.clearTimeout(timer); }, [refresh]);
  const switchWorkspace = useCallback(async (id: string) => {
    await apiFetch(`/workspaces/${id}/activate`, { method: "POST", body: "{}" });
    setActiveId(id); router.refresh();
  }, [router]);
  const value = useMemo(() => ({ user, workspaces, activeWorkspace: workspaces.find((workspace) => workspace.id === activeId) ?? null, loading, switchWorkspace, refresh }), [user, workspaces, activeId, loading, switchWorkspace, refresh]);
  return <DashboardContext.Provider value={value}>{loading || !user ? <div className="min-h-screen animate-pulse bg-zinc-50 dark:bg-zinc-950" aria-label="Loading dashboard" /> : children}</DashboardContext.Provider>;
}
export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) throw new Error("useDashboard must be used inside DashboardProvider");
  return context;
}
