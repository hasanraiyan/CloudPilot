import { createRuntime, type Runtime } from "@personaai/runtime";
import { env } from "../config/env.js";

let cachedRuntime: Runtime | null = null;

export function isAssistantConfigured(): boolean {
  return Boolean(env.PERSONA_CREDENTIAL && env.PERSONA_AGENT_ID);
}

export function getPersonaRuntime(): Runtime | null {
  if (!env.PERSONA_CREDENTIAL) {
    return null;
  }
  if (cachedRuntime) {
    return cachedRuntime;
  }

  cachedRuntime = createRuntime({
    baseUrl: env.PERSONA_BASE_URL,
    credential: env.PERSONA_CREDENTIAL,
    mode: env.NODE_ENV === "development" ? "development" : "production",
    capabilities: {
      mcps: true,
    },
    resolveUser: (req) => {
      const headerUser = req.headers["x-cloudpilot-user-id"];
      if (typeof headerUser === "string" && headerUser.trim().length > 0) {
        return headerUser.trim();
      }
      return null;
    },
  });

  return cachedRuntime;
}
