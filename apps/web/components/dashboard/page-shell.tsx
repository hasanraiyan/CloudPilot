import type { ReactNode } from "react";
import { DashboardTopbar } from "./topbar";

export function DashboardPageShell({
  breadcrumb,
  title,
  description,
  children,
}: {
  breadcrumb: string;
  title?: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <DashboardTopbar breadcrumb={breadcrumb} />
      <main className={`mx-auto max-w-[1480px] px-4 sm:px-6 lg:px-8 ${title ? "py-6" : "py-4"}`}>
        {title && <div className="mb-6">
          <p className="font-mono text-[9px] uppercase tracking-wider text-blue-600 dark:text-blue-400">Development preview</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-1 text-[13px] text-zinc-500">{description}</p>
        </div>}
        {children}
      </main>
    </div>
  );
}
