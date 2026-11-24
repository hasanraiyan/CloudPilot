"use client";

import { useCallback, useEffect, useState } from "react";
import { Rocket, RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { apiFetch } from "@/lib/api";
import { useDashboard } from "@/components/dashboard/dashboard-provider";

type Deployment = { id: string; status: string; environment: string; triggerSource: string; createdAt: string; startedAt: string | null; finishedAt: string | null; failureCode: string | null; project: { id: string; name: string } };
export default function DeploymentsPage() {
  const { activeWorkspace } = useDashboard(); const [items, setItems] = useState<Deployment[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setItems(await apiFetch<Deployment[]>("/deployments")); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load deployments."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, activeWorkspace?.id]);
  return <DashboardPageShell breadcrumb="Deployments" title="Deployments" description={`Actual deployment records for ${activeWorkspace?.name ?? "your active workspace"}.`}>
    {error && <div role="alert" className="mb-4 flex justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button aria-label="Retry" onClick={() => void load()}><RefreshCw className="size-4" /></button></div>}
    {loading ? <div className="h-48 animate-pulse rounded-xl border bg-zinc-50 dark:bg-zinc-900" /> : items.length ? <div className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-950"><table className="w-full min-w-[680px] text-left text-xs"><thead className="border-b text-zinc-500"><tr>{["Project","Status","Environment","Trigger","Created","Duration"].map((header) => <th key={header} className="px-4 py-3 font-medium">{header}</th>)}</tr></thead><tbody className="divide-y">{items.map((item) => <tr key={item.id}><td className="px-4 py-3 font-medium">{item.project.name}</td><td className="px-4 py-3"><span className="rounded-full bg-zinc-100 px-2 py-1 dark:bg-zinc-800">{item.status.toLowerCase()}</span>{item.failureCode && <span className="ml-2 text-red-600">{item.failureCode.toLowerCase()}</span>}</td><td className="px-4 py-3">{item.environment.toLowerCase()}</td><td className="px-4 py-3">{item.triggerSource.toLowerCase().replaceAll("_", " ")}</td><td className="px-4 py-3">{new Date(item.createdAt).toLocaleString()}</td><td className="px-4 py-3">{item.startedAt && item.finishedAt ? `${Math.max(0, Math.round((new Date(item.finishedAt).getTime()-new Date(item.startedAt).getTime())/1000))} sec` : "—"}</td></tr>)}</tbody></table></div> : <div className="rounded-xl border border-dashed py-14 text-center"><Rocket className="mx-auto size-6 text-zinc-400" /><p className="mt-3 text-sm font-medium">No deployment records</p><p className="mt-1 text-xs text-zinc-500">This workspace has no deployments. Execution is not available yet.</p></div>}
    <p className="mt-4 rounded-lg border border-dashed p-3 text-xs text-zinc-500">Deployment execution is not configured. CloudPilot will not simulate a successful deploy.</p>
  </DashboardPageShell>;
}
