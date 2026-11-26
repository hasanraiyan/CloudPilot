import type { ZodRawShapeCompat } from "@modelcontextprotocol/sdk/server/zod-compat.js";

export interface CloudPilotMcpContext {
  userId: string;
}

export interface CloudPilotMcpTool<TInput extends ZodRawShapeCompat | undefined = ZodRawShapeCompat | undefined> {
  name: string;
  description: string;
  inputSchema?: TInput;
  handler: (args: Record<string, unknown>, ctx: CloudPilotMcpContext) => Promise<unknown>;
}
