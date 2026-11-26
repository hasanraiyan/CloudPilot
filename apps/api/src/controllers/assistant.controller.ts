import { Router, type NextFunction, type Request, type Response } from "express";
import { PersonaClient } from "@personaai/sdk";
import { toExpressRouter } from "@personaai/adapters/express";
import { env } from "../config/env.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getPersonaRuntime, isAssistantConfigured } from "../assistant/runtime.js";
import { listRegisteredToolNames } from "../assistant/tools/registry.js";
import { mcpServerUrl } from "../assistant/mcp/server.js";

export const assistantRouter = Router();

let cachedAgentMeta: { agentId: string; imageInputEnabled: boolean; expiresAt: number } | null = null;

async function getAgentImageInputEnabled(): Promise<boolean> {
  if (!env.PERSONA_CREDENTIAL || !env.PERSONA_AGENT_ID) return false;
  if (
    cachedAgentMeta &&
    cachedAgentMeta.agentId === env.PERSONA_AGENT_ID &&
    cachedAgentMeta.expiresAt > Date.now()
  ) {
    return cachedAgentMeta.imageInputEnabled;
  }
  try {
    const client = new PersonaClient({
      baseUrl: env.PERSONA_BASE_URL,
      credential: env.PERSONA_CREDENTIAL,
    });
    const agent = await client.agents.get(env.PERSONA_AGENT_ID);
    const enabled = Boolean(agent.imageInputEnabled);
    cachedAgentMeta = {
      agentId: env.PERSONA_AGENT_ID,
      imageInputEnabled: enabled,
      expiresAt: Date.now() + 30_000,
    };
    return enabled;
  } catch {
    return cachedAgentMeta?.imageInputEnabled ?? false;
  }
}

assistantRouter.get("/config", requireAuth, async (_req: Request, res: Response) => {
  const imageInputEnabled = await getAgentImageInputEnabled();
  res.json({
    success: true,
    data: {
      configured: isAssistantConfigured(),
      agentId: env.PERSONA_AGENT_ID ?? null,
      imageInputEnabled,
      mcpUrl: mcpServerUrl().toString(),
      tools: listRegisteredToolNames(),
    },
  });
});

let cachedExpressAdapter: Router | null = null;

assistantRouter.use(requireAuth, (req: Request, res: Response, next: NextFunction) => {
  const runtime = getPersonaRuntime();
  if (!runtime) {
    res.status(503).json({
      success: false,
      error: {
        code: "ASSISTANT_NOT_CONFIGURED",
        message: "AI Assistant is not configured. Set PERSONA_CREDENTIAL and PERSONA_AGENT_ID in .env.",
      },
    });
    return;
  }

  if (!cachedExpressAdapter) {
    cachedExpressAdapter = toExpressRouter(runtime, (expressReq) => expressReq.userId ?? null);
  }

  req.headers["x-cloudpilot-user-id"] = req.userId!;
  cachedExpressAdapter(req, res, next);
});
