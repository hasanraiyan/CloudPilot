import { Variable } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
export default function EnvironmentVariablesPage() {
  return <DashboardPageShell breadcrumb="Environment Variables" title="Environment Variables" description="Environment-scoped configuration and encrypted secrets."><DashboardEmptyState icon={Variable} title="No environment variables" description="Secret values are never displayed or stored by this frontend preview." /></DashboardPageShell>;
}
