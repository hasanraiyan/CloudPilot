import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { Prisma, prisma } from "@cloudpilot/database";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireAuth, requireCsrf } from "../middlewares/auth.middleware.js";
import { canManage, resolveProject, sendError } from "./project-build-configuration.controller.js";

const environment = z.enum(["DEVELOPMENT", "PREVIEW", "PRODUCTION", "STAGING"]);
const value = z.string().max(16384).refine((text) => !text.includes("\0"), "Values cannot contain NUL characters.");
const createVariable = z.object({
  key: z.string().max(128).regex(/^[A-Za-z_][A-Za-z0-9_]*$/, "Use letters, digits and underscores, starting with a letter or underscore."),
  environment,
  value,
}).strict();
const replaceValue = z.object({ value }).strict();
const filter = z.object({ environment: environment.optional() }).strict();
const metadata = { id: true, key: true, environment: true, createdAt: true, updatedAt: true } as const;

function encrypt(secret: string, context: readonly string[]) {
  const configuredKey = env.ENVIRONMENT_VARIABLE_ENCRYPTION_KEY;
  if (!configuredKey) return null;
  const key = Buffer.from(configuredKey, "hex");
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, nonce);
  cipher.setAAD(Buffer.from(JSON.stringify(context)));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    encryptedValue: ["v1", nonce.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join("."),
    encryptionKeyId: createHash("sha256").update(key).digest("hex").slice(0, 32),
  };
}

const router = Router();
const collection = "/:projectId/environment-variables";
const item = `${collection}/:variableId`;

router.get(collection, requireAuth, async (req, res) => {
  res.set("Cache-Control", "no-store");
  const scope = await resolveProject(req, res);
  if (!scope) return;
  const query = filter.safeParse(req.query);
  if (!query.success) return sendError(res, 400, "INVALID_ENVIRONMENT", "Choose a supported deployment environment.");
  const variables = await prisma.environmentVariable.findMany({
    where: { workspaceId: scope.workspaceId, projectId: scope.projectId, ...(query.data.environment ? { environment: query.data.environment } : {}) },
    select: metadata,
    orderBy: [{ key: "asc" }, { environment: "asc" }],
  });
  res.json({ success: true, data: { variables, count: variables.length } });
});

async function mutate(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  const scope = await resolveProject(req, res);
  if (!scope) return;
  if (!canManage(scope.role)) return sendError(res, 403, "FORBIDDEN", "Workspace administrator access required.");
  const where = { projectId: scope.projectId, workspaceId: scope.workspaceId };
  const id = z.uuid().safeParse(req.params.variableId);
  const action = req.method === "POST" ? "CREATED" : req.method === "PATCH" ? "REPLACED" : "DELETED";
  const creation = action === "CREATED" ? createVariable.safeParse(req.body) : null;
  const replacement = action === "REPLACED" ? replaceValue.safeParse(req.body) : null;
  if (creation && !creation.success) return sendError(res, 400, "INVALID_VARIABLE", "Enter a valid name and scope, with a value up to 16,384 characters and no NUL characters.");
  if (replacement && !replacement.success) return sendError(res, 400, "INVALID_VARIABLE_VALUE", "Enter a value up to 16,384 characters with no NUL characters.");
  if (!creation && !id.success) return sendError(res, 404, "VARIABLE_NOT_FOUND", "Environment variable not found.");
  if (action !== "DELETED" && !env.ENVIRONMENT_VARIABLE_ENCRYPTION_KEY) {
    return sendError(res, 503, "ENCRYPTION_UNAVAILABLE", "Environment variable encryption is unavailable. Contact the server administrator.");
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      let variable;
      if (creation?.success) {
        const { key, environment, value } = creation.data;
        const encrypted = encrypt(value, [scope.workspaceId, scope.projectId, environment, key])!;
        variable = await tx.environmentVariable.create({ data: { ...where, key, environment, ...encrypted }, select: metadata });
      } else {
        const scopedId = { ...where, id: id.data! };
        if (replacement?.success) {
          const existing = await tx.environmentVariable.findUnique({ where: scopedId, select: metadata });
          if (!existing) return null;
          const encrypted = encrypt(replacement.data.value, [scope.workspaceId, scope.projectId, existing.environment, existing.key])!;
          variable = await tx.environmentVariable.update({ where: scopedId, data: encrypted, select: metadata });
        } else {
          variable = await tx.environmentVariable.delete({ where: scopedId, select: metadata });
        }
      }
      await tx.auditLog.create({
        data: {
          workspaceId: scope.workspaceId, actorId: req.userId!,
          action: `PROJECT_ENVIRONMENT_VARIABLE_${action}`, entityType: "EnvironmentVariable", entityId: variable.id,
          metadata: { projectId: scope.projectId, key: variable.key, environment: variable.environment },
        },
      });
      return variable;
    });
    if (!result) return sendError(res, 404, "VARIABLE_NOT_FOUND", "Environment variable not found.");
    if (action === "DELETED") { res.status(204).end(); return; }
    res.status(action === "CREATED" ? 201 : 200).json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") return sendError(res, 409, "DUPLICATE_VARIABLE", "That name already exists in this environment.");
      if (error.code === "P2025") return sendError(res, 404, "VARIABLE_NOT_FOUND", "Environment variable not found.");
    }
    sendError(res, 503, "VARIABLE_UNAVAILABLE", "Environment variable could not be saved or removed.");
  }
}

router.post(collection, requireAuth, requireCsrf, mutate);
router.patch(item, requireAuth, requireCsrf, mutate);
router.delete(item, requireAuth, requireCsrf, mutate);
export const projectEnvironmentVariableRouter = router;
