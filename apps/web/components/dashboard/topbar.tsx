"use client";

import { Bell, Menu, Search, UserRound, Settings, Users, Shield, Palette, LogOut, ChevronsUpDown, Check } from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { DashboardSidebar } from "./sidebar";
import { useDashboard } from "./dashboard-provider";
import { apiFetch } from "@/lib/api";

function initials(name: string | null, email: string) { return (name?.trim() || email).split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((word) => word[0]).join("").toUpperCase(); }

export function DashboardTopbar({ breadcrumb }: { breadcrumb: string }) {
  const { user, workspaces, activeWorkspace, switchWorkspace } = useDashboard();
  const router = useRouter(); const [open, setOpen] = useState(false); const [query, setQuery] = useState("");
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") { event.preventDefault(); setOpen(true); } }; window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey); }, []);
  async function logout() { try { await apiFetch("/auth/logout", { method: "POST", body: "{}" }); } finally { router.replace("/login"); router.refresh(); } }
  const commands = [{ name: "Overview", href: "/dashboard" }, { name: "Projects", href: "/dashboard/projects" }, { name: "Deployments", href: "/dashboard/deployments" }, { name: "Settings", href: "/dashboard/settings" }].filter((item) => item.name.toLowerCase().includes(query.toLowerCase()));
  return <>
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-zinc-200 bg-white/95 px-4 backdrop-blur sm:px-6 dark:border-zinc-800 dark:bg-zinc-950/95">
      <div className="flex min-w-0 items-center gap-3">
        <Sheet><SheetTrigger asChild><button type="button" aria-label="Open dashboard navigation" className="grid size-9 place-items-center rounded-lg border border-zinc-200 lg:hidden dark:border-zinc-800"><Menu className="size-4" /></button></SheetTrigger><SheetContent side="left" className="w-[240px] p-0"><SheetTitle className="sr-only">Dashboard navigation</SheetTitle><DashboardSidebar mobile /></SheetContent></Sheet>
        <div className="min-w-0"><DropdownMenu><DropdownMenuTrigger className="flex max-w-full items-center gap-1 text-[10px] font-medium text-zinc-500 hover:text-zinc-900 dark:hover:text-white"><span className="max-w-[190px] truncate">{activeWorkspace?.name ?? "Workspace"}</span><ChevronsUpDown className="size-3 shrink-0" /></DropdownMenuTrigger><DropdownMenuContent align="start" className="w-64"><DropdownMenuLabel>Switch workspace</DropdownMenuLabel><DropdownMenuSeparator />{workspaces.map((workspace) => <DropdownMenuItem key={workspace.id} onSelect={() => void switchWorkspace(workspace.id)}><span className="flex-1">{workspace.name}</span>{workspace.id === activeWorkspace?.id && <Check className="size-3" />}</DropdownMenuItem>)}<DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/dashboard/settings#workspaces">Manage workspaces</Link></DropdownMenuItem></DropdownMenuContent></DropdownMenu><p className="mt-1 truncate text-[13px] font-medium">{breadcrumb}</p></div>
      </div>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label="Search (Ctrl+K)" onClick={() => setOpen(true)} className="hidden h-9 w-44 items-center gap-2 rounded-lg border border-zinc-200 px-3 text-xs text-zinc-400 sm:flex dark:border-zinc-800"><Search className="size-3.5" /> Search <span className="ml-auto font-mono">Ctrl K</span></button>
        <DropdownMenu><DropdownMenuTrigger aria-label="Notifications" className="grid size-9 place-items-center rounded-lg text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900"><Bell className="size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-72"><DropdownMenuLabel>Notifications</DropdownMenuLabel><DropdownMenuSeparator /><p className="px-2 py-5 text-center text-xs text-zinc-500">You’re all caught up. Notifications will appear here.</p></DropdownMenuContent></DropdownMenu>
        <ThemeToggle compact />
        <DropdownMenu><DropdownMenuTrigger aria-label="User menu" className="grid size-8 place-items-center overflow-hidden rounded-full bg-zinc-950 text-[10px] font-semibold text-white dark:bg-white dark:text-zinc-950">{user?.imageUrl ? <span role="img" aria-label={`${user.name ?? "User"} avatar`} className="size-full bg-cover bg-center" style={{ backgroundImage: `url("${user.imageUrl.replace(/["\\]/g, "")}")` }} /> : initials(user?.name ?? null, user?.email ?? "CP")}</DropdownMenuTrigger><DropdownMenuContent align="end" className="w-64"><DropdownMenuLabel><span className="block text-sm text-foreground">{user?.name || "CloudPilot user"}</span><span className="block truncate font-normal text-muted-foreground">{user?.email}</span></DropdownMenuLabel><DropdownMenuSeparator /><DropdownMenuItem asChild><Link href="/dashboard/settings#profile"><UserRound className="mr-2 size-4" />My Profile</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/dashboard/settings#account"><Settings className="mr-2 size-4" />Account Settings</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/dashboard/settings#workspaces"><Users className="mr-2 size-4" />Manage Workspaces</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/dashboard/settings#connected-accounts"><UserRound className="mr-2 size-4" />Connected Accounts</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/dashboard/settings#security"><Shield className="mr-2 size-4" />Security</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/dashboard/settings#appearance"><Palette className="mr-2 size-4" />Appearance</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem onSelect={() => void logout()} className="text-red-600"><LogOut className="mr-2 size-4" />Sign Out</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
      </div>
    </header>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>Search CloudPilot</DialogTitle><DialogDescription>Jump to a page in your workspace.</DialogDescription></DialogHeader><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages…" className="h-10 rounded-md border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-blue-500" />{commands.length ? <div className="space-y-1">{commands.map((item) => <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="block rounded-md px-3 py-2 text-sm hover:bg-muted">{item.name}</Link>)}</div> : <p className="text-sm text-muted-foreground">No matching pages.</p>}</DialogContent></Dialog>
  </>;
}
