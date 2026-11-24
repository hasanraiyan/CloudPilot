import { Cloud } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

export function AuthShell({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-[1fr_1fr] dark:bg-zinc-950">
      <section className="hidden border-r border-zinc-200 bg-zinc-50 p-10 lg:flex lg:flex-col lg:justify-between dark:border-zinc-800 dark:bg-zinc-900">
        <Link href="/" className="inline-flex w-fit items-center gap-2.5">
          <span className="grid size-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-950 dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
            <Cloud className="size-4" />
          </span>
          <span className="font-semibold">CloudPilot</span>
        </Link>
        <div className="max-w-md">
          <p className="font-mono text-[10px] uppercase tracking-wider text-zinc-400">Development preview</p>
          <blockquote className="mt-5 text-3xl font-semibold leading-tight tracking-tight">
            One clear view across infrastructure, deployments, and operations.
          </blockquote>
        </div>
        <p className="text-xs text-zinc-500">Authentication integration is pending.</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12 sm:px-8">
        <div className="w-full max-w-[390px]">
          <Link href="/" className="mb-10 inline-flex items-center gap-2.5 lg:hidden">
            <span className="grid size-8 place-items-center rounded-lg border border-zinc-200 dark:border-zinc-800">
              <Cloud className="size-4" />
            </span>
            <span className="font-semibold">CloudPilot</span>
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
          {children}
        </div>
      </section>
    </main>
  );
}
