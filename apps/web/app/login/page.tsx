import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export default function LoginPage() {
  return (
    <AuthShell title="Welcome back" description="Sign in to your CloudPilot workspace.">
      <AuthForm mode="login" />
      <p className="mt-6 text-center text-xs text-zinc-500">
        New to CloudPilot?{" "}
        <Link href="/signup" className="font-medium text-zinc-900 underline underline-offset-4 dark:text-white">Create an account</Link>
      </p>
    </AuthShell>
  );
}
