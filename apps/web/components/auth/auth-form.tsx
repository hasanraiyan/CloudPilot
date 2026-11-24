"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { GitHubIcon } from "@/components/shared/github-icon";
import { API_BASE } from "@/lib/api";

export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState("");
  const [strength, setStrength] = useState(0);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(""); setSuccess("");
    setLoading(true);
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "");
    const name = String(form.get("name") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const confirmPassword = String(form.get("confirmPassword") ?? "");
    if (!email.includes("@") || (mode === "signup" && (!name || password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password)))) {
      setError(mode === "signup" ? "Use a valid email and a 12+ character password with upper, lower, and numeric characters." : "Enter a valid email and password.");
      setLoading(false);
      return;
    }
    if (mode === "signup" && password !== confirmPassword) { setError("Passwords do not match."); setLoading(false); return; }
    try {
      const response = await fetch(`${API_BASE}/auth/${mode === "signup" ? "register" : "login"}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
        body: JSON.stringify(mode === "signup" ? { name, email, password } : { email, password }),
      });
      const payload = await response.json() as { error?: { message?: string }; data?: { emailVerification?: { message?: string } } };
      if (!response.ok) throw new Error(payload.error?.message ?? "Could not authenticate.");
      if (mode === "signup") {
        setSuccess("Account created. Email verification is not configured, so no verification email was sent. Redirecting to your dashboard…");
        setLoading(false);
        window.setTimeout(() => router.replace("/dashboard"), 2200);
      } else {
        router.replace("/dashboard");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not authenticate."); setLoading(false); }
  }

  return (
    <div className="mt-7">
      <button
        type="button"
        suppressHydrationWarning
        onClick={() => {
          setError("");
          window.open(`${API_BASE}/auth/github/start`, "_self");
        }}
        className="flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 text-sm font-medium text-zinc-800 transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-200 dark:hover:bg-zinc-900"
        aria-describedby="github-auth-status"
      >
        <GitHubIcon /> Continue with GitHub
      </button>
      <p id="github-auth-status" className="mt-2 text-center text-[11px] text-zinc-500">GitHub OAuth login is ready.</p>
      <div className="my-5 flex items-center gap-3 text-[10px] uppercase tracking-wider text-zinc-400">
        <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" /> or <span className="h-px flex-1 bg-zinc-200 dark:bg-zinc-800" />
      </div>
      <form onSubmit={submit} noValidate className="space-y-4">
        {mode === "signup" && (
          <label className="block text-sm font-medium">
            Full name
          <input required suppressHydrationWarning name="name" autoComplete="name" className="auth-input" placeholder="Jane Developer" />
          </label>
        )}
        <label className="block text-sm font-medium">
          Email
          <input required suppressHydrationWarning name="email" type="email" autoComplete="email" className="auth-input" placeholder="you@example.com" />
        </label>
        <label className="block text-sm font-medium">
          Password
          <span className="relative block">
            <input required suppressHydrationWarning name="password" onChange={(event) => { const value = event.target.value; setStrength([value.length >= 12, /[a-z]/.test(value), /[A-Z]/.test(value), /[0-9]/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length); }} minLength={mode === "signup" ? 12 : 1} maxLength={128} type={visible ? "text" : "password"} autoComplete={mode === "login" ? "current-password" : "new-password"} className="auth-input pr-11" placeholder={mode === "signup" ? "At least 12 characters" : "Your password"} />
            <button suppressHydrationWarning type="button" onClick={() => setVisible((value) => !value)} aria-label={visible ? "Hide password" : "Show password"} className="absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-900">
              {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </span>
        </label>
        {mode === "signup" && <>
          <div aria-live="polite" className="-mt-2 space-y-1"><div className="flex gap-1" aria-label={`Password strength ${strength} of 5`}>{[1,2,3,4,5].map((n) => <span key={n} className={`h-1 flex-1 rounded-full ${n <= strength ? "bg-blue-600" : "bg-zinc-200 dark:bg-zinc-800"}`} />)}</div><p className="text-[11px] text-zinc-500">{strength < 3 ? "Use 12+ characters with mixed case and a number." : strength < 5 ? "Good password. Add a symbol for extra strength." : "Strong password."}</p></div>
          <label className="block text-sm font-medium">Confirm password<input required name="confirmPassword" type={visible ? "text" : "password"} autoComplete="new-password" className="auth-input" placeholder="Re-enter your password" /></label>
        </>}
        {error && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">{error}</p>}
        {success && <p role="status" className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-800 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">{success}</p>}
        <button suppressHydrationWarning type="submit" disabled={loading} className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-zinc-950 text-sm font-medium text-white disabled:opacity-60 dark:bg-white dark:text-zinc-950">
          {loading && <LoaderCircle className="size-4 animate-spin" />}
          {mode === "login" ? "Sign In" : "Create Account"}
        </button>
      </form>
    </div>
  );
}
