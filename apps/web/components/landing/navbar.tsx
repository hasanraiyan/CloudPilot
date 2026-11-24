import { Menu } from "lucide-react";
import Link from "next/link";
import { Brand } from "./brand";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";

export function LandingNavbar() {
  return (
    <header className="sticky top-0 z-40 border-b border-zinc-200/80 bg-white/90 backdrop-blur-md dark:border-zinc-800/80 dark:bg-zinc-950/90">
      <nav
        aria-label="Main navigation"
        className="mx-auto flex h-[68px] max-w-6xl items-center justify-between px-5 sm:px-8"
      >
        <Brand />

        <div className="hidden items-center gap-7 md:flex">
          <Link href="#features" className="nav-link">Product</Link>
          <Link href="#features" className="nav-link">Features</Link>
          <Link href="#architecture" className="nav-link">Architecture</Link>
          <Link href="/documentation" className="nav-link">Documentation</Link>
        </div>

        <div className="hidden items-center gap-2 md:flex">
          <ThemeToggle />
          <Link
            href="/login"
            className="inline-flex h-9 items-center px-3 text-[13px] font-medium text-zinc-700 hover:text-zinc-950 dark:text-zinc-300 dark:hover:text-white"
          >
            Sign In
          </Link>
          <Button asChild size="sm" className="h-9 rounded-lg bg-zinc-950 px-3.5 text-white hover:bg-zinc-800 dark:bg-white dark:text-zinc-950 dark:hover:bg-zinc-200">
            <Link href="/signup">Get Started</Link>
          </Button>
        </div>

        <Sheet>
          <SheetTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              aria-label="Open navigation menu"
              className="md:hidden"
            >
              <Menu className="size-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[min(20rem,calc(100vw-2rem))] p-5">
            <SheetTitle className="sr-only">CloudPilot navigation</SheetTitle>
            <div className="flex items-center justify-between border-b pb-4">
              <Brand compact />
              <ThemeToggle compact />
            </div>
            <div className="flex flex-col gap-1 py-4">
              {[
                ["Product", "#features"],
                ["Features", "#features"],
                ["Architecture", "#architecture"],
                ["Documentation", "/documentation"],
              ].map(([label, href]) => (
                <SheetClose asChild key={label}>
                  <Link href={href} className="rounded-lg px-3 py-3 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900">
                    {label}
                  </Link>
                </SheetClose>
              ))}
            </div>
            <div className="grid gap-2 border-t pt-4">
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Sign In</Link>
              </Button>
              <Button asChild className="w-full">
                <Link href="/signup">Get Started</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </nav>
    </header>
  );
}
