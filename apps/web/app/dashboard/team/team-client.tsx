"use client";

import { useCallback, useEffect, useState } from "react";
import { Users, RefreshCw } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { apiFetch } from "@/lib/api";
import { useDashboard } from "@/components/dashboard/dashboard-provider";

type Member = { id: string; name: string | null; email: string; imageUrl: string | null; role: string; joinedAt: string };
export default function TeamPage() {
  const { activeWorkspace } = useDashboard(); const [members, setMembers] = useState<Member[]>([]); const [loading, setLoading] = useState(true); const [error, setError] = useState("");
  const load = useCallback(async () => { setLoading(true); try { setMembers(await apiFetch<Member[]>("/team")); setError(""); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load members."); } finally { setLoading(false); } }, []);
  useEffect(() => { const timer = window.setTimeout(() => void load(), 0); return () => window.clearTimeout(timer); }, [load, activeWorkspace?.id]);
  return <DashboardPageShell breadcrumb="Team" title="Team" description={`Membership and access roles for ${activeWorkspace?.name ?? "your active workspace"}.`}>
    {error && <div role="alert" className="flex justify-between rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}<button aria-label="Retry" onClick={() => void load()}><RefreshCw className="size-4" /></button></div>}
    {loading ? <div className="h-36 animate-pulse rounded-xl border bg-zinc-50 dark:bg-zinc-900" /> : <div className="overflow-x-auto rounded-xl border bg-white dark:bg-zinc-950"><table className="w-full min-w-[500px] text-left text-xs"><thead className="border-b text-zinc-500"><tr><th className="px-4 py-3 font-medium">Member</th><th className="px-4 py-3 font-medium">Role</th><th className="px-4 py-3 font-medium">Joined</th></tr></thead><tbody className="divide-y">{members.map((member) => <tr key={member.id}><td className="px-4 py-3"><span className="font-medium">{member.name || "CloudPilot user"}</span><span className="mt-1 block text-zinc-500">{member.email}</span></td><td className="px-4 py-3">{member.role.toLowerCase()}</td><td className="px-4 py-3">{new Date(member.joinedAt).toLocaleDateString()}</td></tr>)}</tbody></table></div>}
    {!loading && !members.length && <div className="mt-4 rounded-xl border border-dashed py-10 text-center"><Users className="mx-auto size-6 text-zinc-400" /><p className="mt-2 text-sm font-medium">No workspace members</p></div>}
    <p className="mt-4 text-xs text-zinc-500">Invitations and role changes are unavailable until the team management flow is implemented.</p>
  </DashboardPageShell>;
}
