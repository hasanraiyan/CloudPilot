import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { AuthForm } from "@/components/auth/auth-form";

export default function SignupPage() {
  return (
    <AuthShell title="Create your account" description="Start managing your cloud projects with CloudPilot.">
      <AuthForm mode="signup" />
      <p className="mt-6 text-center text-xs text-zinc-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-zinc-900 underline underline-offset-4 dark:text-white">Sign in</Link>
      </p>
    </AuthShell>
  );
}
