import { Router, type Request, type Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { env } from "../../config/env.js";
import { registerCloudPilotMcpTools } from "../tools/registry.js";
import { cloudpilotOAuthProvider } from "./oauth-provider.js";

export function mcpIssuerUrl(): URL {
  return new URL(env.MCP_PUBLIC_URL ?? `http://${env.HOST}:${env.PORT}`);
}

export function mcpServerUrl(): URL {
  return new URL("/mcp", mcpIssuerUrl());
}

export const mcpRouter = Router();

const bearerAuth = requireBearerAuth({
  verifier: cloudpilotOAuthProvider,
  resourceMetadataUrl: new URL("/.well-known/oauth-protected-resource", mcpIssuerUrl()).toString(),
});

async function handleMcpRequest(req: Request, res: Response) {
  const server = new McpServer({ name: "cloudpilot-mcp", version: "0.1.0" });
  registerCloudPilotMcpTools(server);

  const transport = new StreamableHTTPServerTransport({});

  res.on("close", () => {
    void transport.close();
    void server.close();
  });

  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}

mcpRouter.post("/mcp", bearerAuth, (req, res, next) => {
  void handleMcpRequest(req, res).catch(next);
});

mcpRouter.get("/mcp", bearerAuth, (req, res, next) => {
  void handleMcpRequest(req, res).catch(next);
});

mcpRouter.delete("/mcp", bearerAuth, (req, res, next) => {
  void handleMcpRequest(req, res).catch(next);
});
