import {
  Activity,
  ArrowRight,
  Box,
  Boxes,
  Cloud,
  Code2,
  GitBranch,
  Layers3,
  Monitor,
  Network,
  RefreshCw,
  Rocket,
  Search,
  Settings,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import Link from "next/link";
import { LandingNavbar } from "@/components/landing/navbar";
import { Brand } from "@/components/landing/brand";
import { HeroPreview } from "@/components/landing/hero-preview";
import { GitHubIcon } from "@/components/shared/github-icon";

const githubUrl = "https://github.com/raziquehasan/CloudPilot";

const features = [
  [GitBranch, "GitHub repository integration", "Connect repositories and manage source-driven workspaces.", "Planned"],
  [Rocket, "Automated CI/CD pipelines", "Plan build, test, and deployment workflows for every environment.", "Planned"],
  [Boxes, "Docker container deployments", "Package services and coordinate container-based releases.", "Planned"],
  [Cloud, "AWS infrastructure automation", "Prepare infrastructure provisioning and lifecycle automation.", "Planned"],
  [Layers3, "Infrastructure as Code", "Future Terraform workflows for repeatable, reviewable infrastructure.", "Planned"],
  [Activity, "Real-time monitoring", "Present service health, infrastructure activity, and operational signals.", "Planned"],
  [Terminal, "Centralized deployment logs", "Unify build and deployment output for faster diagnosis.", "Foundation"],
  [Code2, "AI-powered failure analysis", "Correlate logs and deployment context to explain failures.", "Planned"],
  [RefreshCw, "Automated recovery and rollback", "Evaluate health failures and prepare safe recovery workflows.", "Planned"],
] as const;

const technologies = [
  ["Frontend", "Next.js", "React · TypeScript", "Implemented", Code2],
  ["Backend", "Express.js", "Node.js · Zod", "Implemented", Terminal],
  ["Database", "PostgreSQL", "Prisma · UUID isolation", "Implemented", Box],
  ["Queue processing", "Redis", "BullMQ · Workers", "Implemented", RefreshCw],
  ["Monitoring", "Pino", "Prometheus · Grafana", "Foundation / Planned", Activity],
  ["Cloud & automation", "Docker", "AWS · Terraform", "Docker implemented", Cloud],
] as const;

function ArchitectureNode({
  title,
  label,
  planned = false,
}: {
  title: string;
  label: string;
  planned?: boolean;
}) {
  return (
    <div className={`rounded-lg border px-3 py-3 text-center ${planned ? "border-dashed border-zinc-300 dark:border-zinc-700" : "border-zinc-200 dark:border-zinc-800"}`}>
      <p className="text-[11px] font-semibold">{title}</p>
      <p className="mt-1 font-mono text-[8px] text-zinc-400">{label}</p>
    </div>
  );
}

function ArchitectureArrow({ vertical = false }: { vertical?: boolean }) {
  return (
    <div className={vertical ? "mx-auto my-2 flex h-5 w-px items-center justify-center bg-zinc-300 dark:bg-zinc-700" : "hidden items-center justify-center sm:flex"}>
      {!vertical && <ArrowRight className="size-3.5 text-zinc-400" aria-hidden="true" />}
    </div>
  );
}

function FooterColumn({
  title,
  links,
}: {
  title: string;
  links: [string, string][];
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-4 space-y-3">
        {links.map(([label, href]) => (
          href.startsWith("https://") ? (
            <a
              key={label}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="block text-[12px] text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
            >
              {label}
            </a>
          ) : (
            <Link
              key={label}
              href={href}
              className="block text-[12px] text-zinc-500 hover:text-zinc-950 dark:hover:text-white"
            >
              {label}
            </Link>
          )
        ))}
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <main className="min-h-screen overflow-x-hidden bg-white text-zinc-950 dark:bg-zinc-950 dark:text-zinc-50">
      <LandingNavbar />

      <section id="top" className="mx-auto grid max-w-6xl items-center gap-8 px-5 pb-16 pt-8 sm:px-8 sm:pt-10 lg:grid-cols-[1fr_1fr] lg:gap-8 lg:pb-16 lg:pt-12">
        <div>
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-[11px] font-medium text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300">
            <span className="size-1.5 rounded-full bg-blue-500" />
            AI-Powered DevOps Platform
          </div>
          <h1 className="max-w-[620px] text-[clamp(2.75rem,4.8vw,4.25rem)] font-semibold leading-[1.02] tracking-[-0.04em]">
            Deploy smarter.
            <br />
            <span className="text-zinc-500 dark:text-zinc-300 sm:whitespace-nowrap">Scale confidently.</span>
          </h1>
          <p className="mt-7 max-w-[520px] text-[16px] leading-7 text-zinc-600 dark:text-zinc-400 sm:text-[17px]">
            Build, deploy, monitor, and manage your cloud infrastructure from one intelligent DevOps platform.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/login" className="primary-button">
              <GitHubIcon /> Continue with GitHub <ArrowRight className="size-4" />
            </Link>
            <Link href="#features" className="secondary-button">Explore Platform</Link>
          </div>
          <p className="mt-6 inline-flex items-center gap-2 text-[12px] text-zinc-500">
            <span className="size-1.5 rounded-full bg-amber-500" />
            Under active development
          </p>
        </div>
        <HeroPreview />
      </section>

      <section id="features" className="border-y border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="section-heading">
            <p className="section-kicker">Platform capabilities</p>
            <h2>One control plane for the delivery lifecycle.</h2>
          </div>
          <div className="mt-10 grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 lg:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
            {features.map(([Icon, title, description, status]) => (
              <article key={title} className="group bg-white p-6 dark:bg-zinc-950">
                <div className="flex items-center justify-between">
                  <span className="grid size-9 place-items-center rounded-lg border border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300">
                    <Icon className="size-4" />
                  </span>
                  <span className="status-chip">{status}</span>
                </div>
                <h3 className="mt-5 text-[15px] font-semibold">{title}</h3>
                <p className="mt-2 text-[13px] leading-6 text-zinc-600 dark:text-zinc-400">{description}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="section-heading">
          <p className="section-kicker">How it works</p>
          <h2>From source to recovery.</h2>
        </div>
        <ol className="mt-10 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-6">
          {[
            ["1", "Connect GitHub", GitBranch],
            ["2", "Configure Project", Settings],
            ["3", "Build", Box],
            ["4", "Deploy", Rocket],
            ["5", "Monitor", Monitor],
            ["6", "Recover", RefreshCw],
          ].map(([step, label, Icon]) => (
            <li key={String(label)} className="relative rounded-xl border border-zinc-200 p-4 dark:border-zinc-800">
              {step !== "6" && <span aria-hidden="true" className="absolute -right-3 top-1/2 hidden h-px w-6 bg-zinc-300 dark:bg-zinc-700 lg:block" />}
              <span className="font-mono text-[9px] text-zinc-400">{String(step).padStart(2, "0")}</span>
              <Icon className="mt-5 size-4 text-blue-600 dark:text-blue-400" />
              <p className="mt-3 text-[12px] font-medium">{String(label)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section id="architecture" className="border-y border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="grid gap-12 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="section-kicker">Architecture</p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[40px]">A modular platform foundation.</h2>
              <p className="mt-5 max-w-md text-[14px] leading-7 text-zinc-600 dark:text-zinc-400">
                Clear boundaries connect the interface, API, data layer, queues, and infrastructure lifecycle.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-sm sm:p-5 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="grid items-stretch gap-3 sm:grid-cols-[1fr_auto_1fr]">
                <ArchitectureNode title="Next.js" label="Frontend" />
                <ArchitectureArrow />
                <ArchitectureNode title="Express API" label="API" />
              </div>
              <div className="mx-auto my-3 h-5 w-px bg-zinc-300 dark:bg-zinc-700" />
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <p className="mb-3 font-mono text-[8px] uppercase tracking-wider text-zinc-400">Data branch</p>
                  <ArchitectureNode title="PostgreSQL" label="Prisma ORM" />
                </div>
                <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                  <p className="mb-3 font-mono text-[8px] uppercase tracking-wider text-zinc-400">Queue branch</p>
                  <ArchitectureNode title="Redis + BullMQ" label="Worker queue" />
                  <ArchitectureArrow vertical />
                  <ArchitectureNode title="Background worker" label="Jobs" />
                </div>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <ArchitectureNode title="Docker" label="Runtime" />
                <div className="rounded-lg border border-dashed border-zinc-300 p-3 dark:border-zinc-700">
                  <p className="mb-2 font-mono text-[8px] uppercase tracking-wider text-zinc-400">Planned observability</p>
                  <ArchitectureNode title="Prometheus + Grafana" label="Metrics · Dashboards" planned />
                </div>
              </div>
              <div className="mt-3 rounded-lg border border-dashed border-zinc-300 p-3 text-center dark:border-zinc-700">
                <p className="font-mono text-[8px] uppercase tracking-wider text-zinc-400">Planned cloud integration</p>
                <p className="mt-2 text-[11px] font-medium">AWS + Terraform</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="documentation" className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.8fr_1.2fr]">
          <div>
            <p className="section-kicker">Technology stack</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[40px]">Built with a modern engineering stack.</h2>
          </div>
          <div className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-2 dark:border-zinc-800 dark:bg-zinc-800">
            {technologies.map(([category, one, two, status, Icon]) => (
              <article key={category} className="bg-white p-5 dark:bg-zinc-950">
                <div className="flex items-center justify-between">
                  <span className="grid size-8 place-items-center rounded-md border border-zinc-200 text-zinc-700 dark:border-zinc-800 dark:text-zinc-300"><Icon className="size-4" /></span>
                  <p className="font-mono text-[8px] uppercase tracking-wider text-zinc-400">{status}</p>
                </div>
                <p className="mt-5 text-[10px] font-mono uppercase tracking-wider text-zinc-400">{category}</p>
                <div className="mt-3 space-y-1 text-[13px]">
                  <p className="font-semibold">{one}</p>
                  <p className="text-zinc-500">{two}</p>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="mt-16 grid gap-4 lg:grid-cols-3">
          {[
            [Search, "Developer experience", "Clear project structure, focused tools, and source-based configuration."],
            [ShieldCheck, "Security principles", "Tenant isolation, secret boundaries, and explicit authorization requirements."],
            [Network, "Reliability principles", "Health checks, bounded timeouts, retries, and visible lifecycle state."],
          ].map(([Icon, title, text]) => (
            <article key={String(title)} className="rounded-xl border border-zinc-200 p-6 dark:border-zinc-800">
              <Icon className="size-5 text-zinc-700 dark:text-zinc-300" />
              <h3 className="mt-5 text-[15px] font-semibold">{String(title)}</h3>
              <p className="mt-2 text-[13px] leading-6 text-zinc-600 dark:text-zinc-400">{String(text)}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
          <div className="section-heading">
            <p className="section-kicker">Product previews</p>
            <h2>Infrastructure and delivery, in one view.</h2>
          </div>
          <div className="mt-10 grid gap-4 lg:grid-cols-2">
            <article className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold">Infrastructure monitoring preview</p>
                  <p className="mt-1 text-[10px] text-zinc-500">Illustrative service topology</p>
                </div>
                <span className="status-chip">Illustrative</span>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3">
                {[
                  ["CPU utilization", "32%", "38%"],
                  ["Memory utilization", "61%", "4.8 GB"],
                  ["Disk usage", "44%", "18 GB"],
                  ["Service health", "3 / 3", "illustrative"],
                ].map(([title, value, detail]) => (
                  <div key={title} className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
                    <p className="text-[9px] text-zinc-500">{title}</p>
                    <p className="mt-2 text-[16px] font-semibold">{value}</p>
                    <p className="mt-1 font-mono text-[8px] text-zinc-400">{detail}</p>
                    <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-900">
                      <div className="h-full w-[38%] rounded-full bg-blue-500" />
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="rounded-xl border border-zinc-200 bg-white p-5 sm:p-6 dark:border-zinc-800 dark:bg-zinc-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-semibold">Deployment workflow preview</p>
                  <p className="mt-1 text-[10px] text-zinc-500">Illustrative build lifecycle</p>
                </div>
                <span className="status-chip">Illustrative</span>
              </div>
              <div className="mt-6 overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950 font-mono text-[9px] text-zinc-300">
                <div className="flex h-8 items-center gap-1.5 border-b border-zinc-800 px-3">
                  <span className="size-1.5 rounded-full bg-zinc-600" />
                  <span className="size-1.5 rounded-full bg-zinc-600" />
                  <span className="size-1.5 rounded-full bg-zinc-600" />
                  <span className="ml-2 text-[8px] text-zinc-500">cloudpilot/deploy</span>
                </div>
                <div className="space-y-2 p-3">
                  <p><span className="text-emerald-400">$</span> prepare-source</p>
                  <p className="text-zinc-500">→ repository context ready</p>
                  <p><span className="text-emerald-400">$</span> build-container</p>
                  <p className="text-zinc-500">→ image preparation planned</p>
                  <p><span className="text-blue-400">$</span> deploy</p>
                  <p className="text-zinc-500">→ deployment execution planned</p>
                  <p><span className="text-amber-400">$</span> health-check</p>
                  <p className="text-zinc-500">→ awaiting runtime integration</p>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-24">
        <div className="grid gap-12 lg:grid-cols-[0.7fr_1.3fr]">
          <div>
            <p className="section-kicker">Development roadmap</p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-[40px]">Built in deliberate phases.</h2>
          </div>
          <ol className="grid gap-px overflow-hidden rounded-xl border border-zinc-200 bg-zinc-200 sm:grid-cols-3 dark:border-zinc-800 dark:bg-zinc-800">
            {[
              ["Now", "Core infrastructure", "PostgreSQL, Redis, queues, and the shared frontend foundation."],
              ["Next", "Authentication and monitoring", "Secure access, health signals, and workspace operations."],
              ["Later", "Automation and AI", "Deployment execution, rollback, Terraform, AWS, and diagnostics."],
            ].map(([phase, title, text]) => (
              <li key={phase} className="bg-white p-5 dark:bg-zinc-950">
                <p className="font-mono text-[9px] uppercase tracking-wider text-blue-600 dark:text-blue-400">{phase}</p>
                <h3 className="mt-5 text-[13px] font-semibold">{title}</h3>
                <p className="mt-2 text-[12px] leading-5 text-zinc-600 dark:text-zinc-400">{text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="border-t border-zinc-200 bg-zinc-50/70 dark:border-zinc-800 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-3xl px-5 py-20 text-center sm:px-8 sm:py-24">
          <p className="section-kicker">Frequently asked questions</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Questions, answered clearly.</h2>
          <div className="mt-8 space-y-2 text-left">
            {[
              ["Is CloudPilot ready to deploy applications?", "Not yet. The infrastructure foundation is implemented, while deployment execution remains planned."],
              ["Does authentication work?", "Authentication screens are available as UI foundations only. GitHub OAuth and secure account integration are not implemented."],
              ["Is the dashboard connected to live infrastructure?", "No. Dashboard and product preview values are illustrative and must not be interpreted as live metrics."],
              ["Can I contribute or review the source?", "Yes. The project and documentation are available in the public GitHub repository."],
            ].map(([question, answer]) => (
              <details key={question} className="group rounded-lg border border-zinc-200 bg-white px-4 dark:border-zinc-800 dark:bg-zinc-950">
                <summary className="cursor-pointer list-none py-4 text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-500 [&::-webkit-details-marker]:hidden">{question}</summary>
                <p className="pb-4 text-[12px] leading-6 text-zinc-600 dark:text-zinc-400">{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8">
          <div className="flex flex-col items-start justify-between gap-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-7 sm:flex-row sm:items-center dark:border-zinc-800 dark:bg-zinc-900">
            <div>
              <p className="section-kicker">Development preview</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight">Explore the proposed product interface.</h2>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href="/dashboard" className="primary-button">Open Preview</Link>
              <a href={githubUrl} target="_blank" rel="noreferrer" className="secondary-button">View GitHub</a>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-zinc-200 dark:border-zinc-800">
        <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8">
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_1fr]">
            <div>
              <Brand />
              <p className="mt-4 max-w-xs text-[12px] leading-6 text-zinc-500">
                An open-source platform for building, deploying, and observing cloud infrastructure.
              </p>
              <a
                href={githubUrl}
                target="_blank"
                rel="noreferrer"
                className="mt-5 inline-flex items-center gap-2 rounded-md border border-zinc-200 px-3 py-2 text-[12px] font-medium hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
              >
                <GitBranch className="size-3.5" />
                View source on GitHub
              </a>
            </div>
            <FooterColumn
              title="Product"
              links={[
                ["Features", "#features"],
                ["Architecture", "#architecture"],
                ["Dashboard preview", "/dashboard"],
              ]}
            />
            <FooterColumn
              title="Resources"
              links={[
                ["Documentation", "#documentation"],
                ["Frequently asked questions", "#top"],
              ]}
            />
            <FooterColumn
              title="Project"
              links={[
                ["GitHub", githubUrl],
                ["Razique Hasan", "https://github.com/raziquehasan"],
                ["Raiyan Hasan", "https://hasanraiyan.me"],
              ]}
            />
          </div>
          <div className="mt-10 flex flex-col gap-3 border-t border-zinc-200 pt-6 text-[11px] text-zinc-500 sm:flex-row sm:items-center sm:justify-between dark:border-zinc-800">
            <p>© CloudPilot. Developed by Razique Hasan &amp; Raiyan Hasan.</p>
            <p>Development preview — not live infrastructure data.</p>
          </div>
        </div>
      </footer>
    </main>
  );
}
