import { z } from "zod";
import { deploymentStatuses } from "../services/deployment-state-machine.js";
import { branchNameSchema } from "./project-intelligence.validator.js";

export const deploymentEnvironmentSchema = z.enum([
  "DEVELOPMENT",
  "STAGING",
  "PRODUCTION",
  "PREVIEW",
]);

export const deploymentStatusSchema = z.enum(deploymentStatuses);

export const createDeploymentSchema = z.object({
  branch: branchNameSchema.optional(),
  environment: deploymentEnvironmentSchema,
}).strict();

export const deploymentListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
  status: deploymentStatusSchema.optional(),
}).strict();

export const idempotencyKeySchema = z.string()
  .trim()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/u);

export const deploymentIdSchema = z.string().uuid();
