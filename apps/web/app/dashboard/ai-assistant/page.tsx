import { Bot } from "lucide-react";
import { DashboardPageShell } from "@/components/dashboard/page-shell";
import { DashboardEmptyState } from "@/components/dashboard/empty-state";
export default function AiAssistantPage() {
  return <DashboardPageShell breadcrumb="AI Assistant" title="AI Assistant" description="Context-aware infrastructure diagnostics."><DashboardEmptyState icon={Bot} title="AI Assistant unavailable" description="Analysis features are planned and require backend integration." /></DashboardPageShell>;
}
