import { z } from "zod";

const identifierSchema = z.string().trim().min(1).max(128);

export const diagnosticJobSchema = z.object({
  kind: z.literal("diagnostic"),
  correlationId: identifierSchema,
  message: z.string().trim().min(1).max(500).optional(),
  transientFailureOnce: z.boolean().optional(),
  permanentFailure: z.boolean().optional(),
  blockForMs: z.number().int().min(1).max(30000).optional(),
}).strict();

export const deploymentJobSchema = z.object({
  kind: z.literal("deployment"),
  workspaceId: z.uuid(),
  projectId: z.uuid(),
  deploymentId: z.uuid(),
  eventId: z.uuid(),
  correlationId: identifierSchema,
  idempotencyKey: identifierSchema,
}).strict();

export const buildJobSchema = z.object({
  kind: z.literal("build"),
  workspaceId: z.uuid(),
  projectId: z.uuid(),
  deploymentId: z.uuid(),
  buildId: z.uuid(),
  correlationId: identifierSchema,
}).strict();

export const rollbackJobSchema = z.object({
  kind: z.literal("rollback"),
  workspaceId: z.uuid(),
  projectId: z.uuid(),
  deploymentId: z.uuid(),
  rollbackOfId: z.uuid(),
  correlationId: identifierSchema,
  idempotencyKey: identifierSchema,
}).strict();

export const queueJobSchema = z.discriminatedUnion("kind", [
  diagnosticJobSchema,
  deploymentJobSchema,
  buildJobSchema,
  rollbackJobSchema,
]);

export type DiagnosticJob = z.infer<typeof diagnosticJobSchema>;
export type DeploymentJob = z.infer<typeof deploymentJobSchema>;
export type BuildJob = z.infer<typeof buildJobSchema>;
export type RollbackJob = z.infer<typeof rollbackJobSchema>;
export type QueueJob = z.infer<typeof queueJobSchema>;

export const queuePayloadSchemas = Object.freeze({
  diagnostic: diagnosticJobSchema,
  deployment: deploymentJobSchema,
  build: buildJobSchema,
  rollback: rollbackJobSchema,
});

export interface DiagnosticResult {
  kind: "diagnostic";
  correlationId: string;
  processedAt: string;
}
