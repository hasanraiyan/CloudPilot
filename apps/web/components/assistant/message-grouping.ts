import type { PersonaMessage } from "@personaai/react";

export interface GroupedMessage {
  message: PersonaMessage;
  reasoningPhases?: PersonaMessage[];
}

export function groupReasoning(messages: PersonaMessage[]): GroupedMessage[] {
  const result: GroupedMessage[] = [];
  let pending: PersonaMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") continue;

    if (msg.role === "reasoning") {
      pending.push(msg);
      continue;
    }

    result.push({
      message: msg,
      reasoningPhases: msg.role === "assistant" && pending.length ? pending : undefined,
    });
    pending = [];
  }

  return result;
}
