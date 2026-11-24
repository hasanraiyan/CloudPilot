import { Activity } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
export default function MonitoringPage() {
  return <DashboardPageShell breadcrumb="Monitoring" title="Monitoring" description="Service health and operational signals."><DashboardEmptyState icon={Activity} title="Monitoring not configured" description="No live metrics or health data are available in this preview." /></DashboardPageShell>;
}
