import {
  Activity,
  Box,
  Cpu,
  MemoryStick,
  GitBranch,
  LayoutDashboard,
  MoreHorizontal,
  Settings,
  Terminal,
} from "lucide-react";

export function HeroPreview() {
  return (
    <div
      className="relative mx-auto w-full max-w-[520px]"
      aria-label="Illustrative CloudPilot dashboard preview"
    >
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-[0_28px_90px_-48px_rgba(24,24,27,0.48)] dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex h-10 items-center justify-between border-b border-zinc-200 px-3 dark:border-zinc-800">
          <div className="flex gap-1.5">
            <span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
            <span className="size-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
          </div>
          <span className="rounded border border-zinc-200 px-2 py-1 font-mono text-[8px] text-zinc-500 dark:border-zinc-800">
            ILLUSTRATIVE PREVIEW
          </span>
        </div>
        <div className="grid min-h-[390px] grid-cols-[74px_1fr] sm:grid-cols-[116px_1fr]">
          <aside className="border-r border-zinc-200 p-2.5 dark:border-zinc-800 sm:p-3">
            <div className="mb-5 flex items-center gap-2 px-1">
              <span className="grid size-6 place-items-center rounded-md bg-zinc-950 text-white dark:bg-white dark:text-zinc-950">
                <Box className="size-3" />
              </span>
              <span className="hidden text-[10px] font-semibold sm:block">Acme Cloud</span>
            </div>
            {[
              [LayoutDashboard, "Overview"],
              [GitBranch, "Deployments"],
              [Activity, "Monitoring"],
              [Terminal, "Logs"],
              [Settings, "Settings"],
            ].map(([Icon, label], index) => (
              <div
                key={String(label)}
                className={`mb-1 flex h-8 items-center gap-2 rounded-md px-2 text-[9px] ${
                  index === 0
                    ? "bg-zinc-100 font-medium text-zinc-900 dark:bg-zinc-900 dark:text-white"
                    : "text-zinc-500"
                }`}
              >
                <Icon className="size-3" />
                <span className="hidden sm:block">{String(label)}</span>
              </div>
            ))}
          </aside>
          <div className="min-w-0 p-3 sm:p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-semibold">Overview</p>
                <p className="mt-1 text-[8px] text-zinc-500">Illustrative workspace data</p>
              </div>
              <span className="rounded-md border border-zinc-200 px-2 py-1 font-mono text-[8px] text-zinc-500 dark:border-zinc-800">
                production
              </span>
            </div>
            <div className="mt-4 grid grid-cols-3 gap-2">
              {[
                ["Services", "12"],
                ["Deployments", "48"],
                ["Incidents", "0"],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-zinc-200 p-2.5 dark:border-zinc-800">
                  <p className="text-[10px] text-zinc-500">{label}</p>
                  <p className="mt-2 text-[17px] font-semibold tracking-tight">{value}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              {[
                [Cpu, "CPU utilization", "32%"],
                [MemoryStick, "Memory", "4.8 GB"],
              ].map(([Icon, label, value]) => (
                <div key={String(label)} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-[10px] font-medium"><Icon className="size-3" />{String(label)}</span>
                    <span className="font-mono text-[8px] text-zinc-500">{String(value)}</span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                    <div className="h-full w-[38%] rounded-full bg-blue-500" />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-[1fr_0.8fr] gap-2">
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <div className="flex items-center justify-between">
                  <p className="text-[9px] font-medium">Service health</p>
                  <MoreHorizontal className="size-3 text-zinc-400" />
                </div>
                {["api", "worker", "web"].map((service, index) => (
                  <div key={service} className="mt-2 flex items-center justify-between text-[8px]">
                    <span className="flex items-center gap-2"><span className="size-1.5 rounded-full bg-emerald-500" />{service}</span>
                    <span className="font-mono text-zinc-400">{index === 0 ? "healthy" : "ready"}</span>
                  </div>
                ))}
              </div>
              <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                <p className="text-[9px] font-medium">Recent deployments</p>
                {["Build #48", "Build #47", "Build #46"].map((item, index) => (
                  <div key={item} className="mt-2 flex items-center justify-between text-[8px]">
                    <span>{item}</span>
                    <span className="font-mono text-zinc-400">{index === 0 ? "now" : `${index * 6 + 4}m`}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
