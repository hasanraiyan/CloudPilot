import type { LucideIcon } from "lucide-react";

export function DashboardEmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
}) {
  return (
    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-xl border border-dashed border-zinc-300 bg-white px-6 text-center dark:border-zinc-800 dark:bg-zinc-950">
      <span className="grid size-10 place-items-center rounded-lg bg-zinc-100 text-zinc-600 dark:bg-zinc-900 dark:text-zinc-300">
        <Icon className="size-5" />
      </span>
      <h2 className="mt-4 text-sm font-semibold">{title}</h2>
      <p className="mt-2 max-w-sm text-xs leading-5 text-zinc-500">{description}</p>
    </div>
  );
}
