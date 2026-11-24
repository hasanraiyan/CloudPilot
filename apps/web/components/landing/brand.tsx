import { Cloud } from "lucide-react";
import Link from "next/link";

export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      aria-label="CloudPilot home"
      className="inline-flex items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-blue-500"
    >
      <span className="grid size-8 place-items-center rounded-lg border border-zinc-200 bg-white text-zinc-950 shadow-sm dark:border-zinc-800 dark:bg-zinc-950 dark:text-white">
        <Cloud className="size-[17px]" strokeWidth={1.8} aria-hidden="true" />
      </span>
      <span
        className={
          compact
            ? "font-semibold tracking-[-0.04em] text-zinc-950 dark:text-white"
            : "text-[16px] font-semibold tracking-[-0.04em] text-zinc-950 dark:text-white"
        }
      >
        CloudPilot
      </span>
    </Link>
  );
}
