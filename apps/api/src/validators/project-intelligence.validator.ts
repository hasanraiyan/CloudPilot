import { z } from "zod";

const safeGitHubRef = z.string().min(1).max(255).refine((value) =>
  !/[\u0000-\u0020\u007f~^:?*]/u.test(value) && !value.includes("[") && !value.includes("\\") &&
  !value.includes("..") && !value.includes("//") && !value.endsWith("/") && !value.endsWith(".lock"),
  "Invalid Git reference.",
);

export const projectIdSchema = z.string().uuid();
export const commitShaSchema = z.string().regex(/^[a-f0-9]{7,40}$/i, "Invalid commit SHA.");
export const branchNameSchema = safeGitHubRef;
export const branchUpdateSchema = z.object({ branch: safeGitHubRef }).strict();
export const repositoryPathSchema = z.string().max(1024).refine((value) => {
  if (!value) return true;
  if (value.startsWith("/") || value.includes("\\") || /[\u0000-\u001f\u007f]/u.test(value)) return false;
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}, "Invalid repository path.");

export const repositoryListQuerySchema = z.object({
  branch: safeGitHubRef.optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  per_page: z.coerce.number().int().min(1).max(100).default(30),
  search: z.string().trim().max(100).default(""),
}).strict();

export const repositoryFileQuerySchema = z.object({
  branch: safeGitHubRef.optional(),
  path: repositoryPathSchema.default(""),
}).strict();

const optionalText = (max: number) => z.string().max(max).nullable().optional();

export const buildConfigurationSchema = z.object({
  framework: optionalText(80),
  runtime: optionalText(80),
  packageManager: optionalText(80),
  rootDirectory: optionalText(500).refine((value) => value == null || isSafeRelativePath(value), "Root directory must be a safe repository-relative path."),
  installCommand: optionalText(2000),
  buildCommand: optionalText(2000),
  startCommand: optionalText(2000),
  dockerfilePath: optionalText(500).refine((value) => value == null || isSafeRelativePath(value), "Dockerfile path must be a safe repository-relative path."),
  applicationPort: z.number().int().min(1).max(65535).nullable().optional(),
  buildTimeoutSeconds: z.number().int().min(30).max(3600).nullable().optional(),
  environment: z.enum(["DEVELOPMENT", "STAGING", "PRODUCTION", "PREVIEW"]).nullable().optional(),
}).strict();

function isSafeRelativePath(value: string): boolean {
  if (!value || value === ".") return true;
  if (value.startsWith("/") || value.includes("\\") || /[:\u0000-\u001f\u007f]/u.test(value)) return false;
  return value.split("/").every((part) => part.length > 0 && part !== "." && part !== "..");
}
