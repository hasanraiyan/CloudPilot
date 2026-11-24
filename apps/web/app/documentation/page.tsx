import { ArrowLeft, BookOpen, Boxes, Database, GitBranch, Layers3, Workflow } from "lucide-react";
import Link from "next/link";
import { LandingNavbar } from "@/components/landing/navbar";
import { Brand } from "@/components/landing/brand";

const sections = [
  ["Getting started", "Understand the CloudPilot workspace and local development flow.", GitBranch],
  ["Architecture", "Review the frontend, API, database, queue, and worker boundaries.", Boxes],
  ["Database", "Explore the PostgreSQL and Prisma foundation.", Database],
  ["Queue processing", "Learn the Redis and BullMQ contract model.", Workflow],
  ["Deployment model", "Review the planned build, deployment, and rollback lifecycle.", Layers3],
] as const;

export default function DocumentationPage() {
  return (
    <main className="min-h-screen bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <LandingNavbar />
      <div className="mx-auto max-w-6xl px-5 py-10 sm:px-8 sm:py-16">
        <Link href="/" className="inline-flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-950 dark:hover:text-white">
          <ArrowLeft className="size-3.5" /> Back to CloudPilot
        </Link>

        <header className="mt-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-zinc-200 px-3 py-1.5 text-[11px] text-zinc-600 dark:border-zinc-800 dark:text-zinc-300">
            <BookOpen className="size-3.5" /> Documentation preview
          </span>
          <h1 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
            CloudPilot platform documentation
          </h1>
          <p className="mt-5 text-sm leading-7 text-zinc-600 dark:text-zinc-400">
            Documentation for the current frontend, infrastructure foundation, and planned platform integrations.
          </p>
        </header>

        <div className="mt-12 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
          {sections.map(([title, description, Icon]) => (
            <article key={title} className="bg-white p-6 dark:bg-zinc-950">
              <span className="grid size-9 place-items-center rounded-lg border border-zinc-200 dark:border-zinc-800">
                <Icon className="size-4 text-blue-600 dark:text-blue-400" />
              </span>
              <h2 className="mt-5 text-sm font-semibold">{title}</h2>
              <p className="mt-2 text-xs leading-5 text-zinc-500">{description}</p>
              <p className="mt-5 font-mono text-[9px] uppercase tracking-wider text-zinc-400">Coming soon</p>
            </article>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-start justify-between gap-5 rounded-xl border border-zinc-200 p-6 sm:flex-row sm:items-center dark:border-zinc-800">
          <div>
            <p className="font-mono text-[9px] uppercase tracking-wider text-blue-600 dark:text-blue-400">Repository</p>
            <p className="mt-2 text-sm font-semibold">Source, migrations, and infrastructure docs</p>
          </div>
          <a
            href="https://github.com/raziquehasan/CloudPilot"
            target="_blank"
            rel="noreferrer"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-zinc-200 px-4 text-xs font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
          >
            <GitBranch className="size-3.5" /> View GitHub
          </a>
        </div>
      </div>
      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-8 sm:px-8">
          <Brand />
          <p className="text-[11px] text-zinc-500">Documentation preview</p>
        </div>
      </footer>
    </main>
  );
}
