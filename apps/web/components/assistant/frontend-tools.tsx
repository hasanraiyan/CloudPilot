"use client";

import { useFrontendTool } from "@personaai/react";
import { usePathname, useRouter } from "next/navigation";
import { useDashboard } from "@/components/dashboard/dashboard-provider";

/**
 * Modular client-side frontend tools registered with Persona AI.
 * Add new UI actions here using `useFrontendTool` or `useHumanInTheLoop`.
 */
export function CloudPilotFrontendTools() {
  const router = useRouter();
  const pathname = usePathname();
  const { activeWorkspace, workspaces, user } = useDashboard();

  useFrontendTool<{ page: string }>({
    name: "navigate_to_page",
    description:
      "Navigate the CloudPilot dashboard to a specific section. Allowed pages: overview, projects, deployments, infrastructure, monitoring, logs, environment-variables, team, settings.",
    parameters: {
      type: "object",
      properties: {
        page: {
          type: "string",
          description: "Dashboard section slug (e.g. overview, projects, deployments, settings)",
        },
      },
      required: ["page"],
    },
    handler: ({ page }) => {
      const clean = String(page ?? "").trim().replace(/^\/+/, "");
      const href = clean === "overview" || clean === "" ? "/dashboard" : `/dashboard/${clean}`;
      router.push(href);
      return { navigatedTo: href };
    },
  });

  useFrontendTool<{ projectId: string; section?: string }>({
    name: "open_project_section",
    description:
      "Open a specific CloudPilot project page or one of its sections (overview, repository, build, environment-variables, deployments).",
    parameters: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "UUID of the project" },
        section: {
          type: "string",
          description: "Optional section slug: repository, build, environment-variables, deployments",
        },
      },
      required: ["projectId"],
    },
    handler: ({ projectId, section }) => {
      const id = String(projectId ?? "").trim();
      const sec = section ? String(section).trim() : "";
      const href = sec && sec !== "overview" ? `/dashboard/projects/${id}/${sec}` : `/dashboard/projects/${id}`;
      router.push(href);
      return { navigatedTo: href };
    },
  });

  useFrontendTool({
    name: "get_current_context",
    description: "Get the user's current dashboard route, active workspace, and available workspaces.",
    handler: () => ({
      pathname,
      activeWorkspace,
      workspaces: workspaces.map((w) => ({ id: w.id, name: w.name, role: w.role })),
      user: user ? { id: user.id, name: user.name, email: user.email } : null,
    }),
  });

  return null;
}
