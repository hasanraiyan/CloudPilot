import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { projectsMcpTools } from "./projects.tools.js";
import type { CloudPilotMcpTool } from "./types.js";

/**
 * Add new MCP tool modules here (e.g. deployments, monitoring, logs, github).
 * Every tool in this list is automatically registered on the official MCP server.
 */
const MCP_TOOLS: CloudPilotMcpTool[] = [
  ...projectsMcpTools,
];

export function listRegisteredToolNames(): string[] {
  return MCP_TOOLS.map((tool) => tool.name);
}

export function registerCloudPilotMcpTools(server: McpServer): void {
  for (const tool of MCP_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        ...(tool.inputSchema ? { inputSchema: tool.inputSchema } : {}),
      },
      async (args, extra) => {
        const userId = extra.authInfo?.extra?.userId;
        if (typeof userId !== "string" || !userId) {
          return {
            isError: true,
            content: [{ type: "text", text: JSON.stringify({ error: "Unauthorized MCP request" }) }],
          };
        }

        const result = await tool.handler((args ?? {}) as Record<string, unknown>, { userId });
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
        };
      },
    );
  }
}
