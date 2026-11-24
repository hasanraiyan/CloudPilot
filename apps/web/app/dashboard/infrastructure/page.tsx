import { Layers3 } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
export default function InfrastructurePage() {
  return <DashboardPageShell breadcrumb="Infrastructure" title="Infrastructure" description="Cloud resources and infrastructure-as-code status."><DashboardEmptyState icon={Layers3} title="No infrastructure connected" description="AWS and Terraform integration are planned and are not active." /></DashboardPageShell>;
}
