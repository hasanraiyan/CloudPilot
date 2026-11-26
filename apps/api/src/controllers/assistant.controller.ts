import { Router, type NextFunction, type Request, type Response } from "express";
import { toExpressRouter } from "@personaai/adapters/express";
import { env } from "../config/env.js";
import { requireAuth } from "../middlewares/auth.middleware.js";
import { getPersonaRuntime, isAssistantConfigured } from "../assistant/runtime.js";
import { listRegisteredToolNames } from "../assistant/tools/registry.js";
import { mcpServerUrl } from "../assistant/mcp/server.js";

export const assistantRouter = Router();

assistantRouter.get("/config", requireAuth, (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      configured: isAssistantConfigured(),
      agentId: env.PERSONA_AGENT_ID ?? null,
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
