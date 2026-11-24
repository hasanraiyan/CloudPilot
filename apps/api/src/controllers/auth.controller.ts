import argon2 from "argon2";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "@cloudpilot/database";
import type { Request, Response } from "express";
import { createSession, clearSessionCookies, revokeSession } from "../services/session.service.js";
import { requireAuth, requireCsrf } from "../middlewares/auth.middleware.js";
import { rateLimit } from "express-rate-limit";

const registerSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
}).strict();
const loginSchema = z.object({ email: z.string().trim().email().max(254), password: z.string().min(1).max(128) }).strict();
const profileSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
const passwordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/) }).strict();

function slugify(value: string) { return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 45) || "personal"; }
async function createPersonalWorkspace(tx: any, userId: string, name: string) {
  const base = slugify(name) + "-personal";
  let slug = base;
  for (let suffix = 2; await tx.workspace.findUnique({ where: { slug }, select: { id: true } }); suffix++) slug = `${base}-${suffix}`;
  const workspace = await tx.workspace.create({ data: { name: `${name}'s Workspace`, slug } });
  await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId, role: "OWNER" } });
  return workspace;
}
async function ensurePersonalWorkspace(userId: string, name: string) {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${userId})) IS NULL`;
    const membership = await tx.workspaceMember.findFirst({ where: { userId }, select: { workspaceId: true } });
    if (!membership) await createPersonalWorkspace(tx, userId, name);
  });
}
const publicUser = (u: { id: string; email: string; name: string | null; imageUrl: string | null; createdAt: Date; accounts?: { provider: string }[] }) => ({
  id: u.id, email: u.email, name: u.name, imageUrl: u.imageUrl, createdAt: u.createdAt,
  providers: u.accounts?.map((account) => account.provider) ?? [],
});

export async function register(req: Request, res: Response): Promise<void> {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Check the registration details." } }); return; }
  const { name, password } = parsed.data;
  const email = parsed.data.email.toLowerCase();
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  try {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name } });
      await tx.account.create({ data: { userId: user.id, provider: "EMAIL_PASSWORD", providerAccountId: email, passwordHash } });
      await createPersonalWorkspace(tx, user.id, name);
      return user;
    });
    await createSession(created.id, res);
    res.status(201).json({ success: true, data: { user: publicUser(created), emailVerification: { status: "not_configured", message: "Email verification is unavailable until an email provider is configured." } } });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") { res.status(409).json({ success: false, error: { code: "EMAIL_ALREADY_REGISTERED", message: "An account with that email already exists." } }); return; }
    throw error;
  }
}

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Enter a valid email and password." } }); return; }
  const email = parsed.data.email.toLowerCase();
  const account = await prisma.account.findFirst({ where: { provider: "EMAIL_PASSWORD", providerAccountId: email }, select: { userId: true, passwordHash: true } });
  const ok = account?.passwordHash ? await argon2.verify(account.passwordHash, parsed.data.password).catch(() => false) : false;
  if (!account || !ok) { res.status(401).json({ success: false, error: { code: "INVALID_CREDENTIALS", message: "Invalid email or password." } }); return; }
  const user = await prisma.user.findUnique({ where: { id: account.userId }, select: { name: true } });
  if (user) await ensurePersonalWorkspace(account.userId, user.name ?? "Personal");
  await createSession(account.userId, res);
  res.json({ success: true, data: { authenticated: true } });
}

export async function me(req: Request, res: Response): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: req.userId! }, select: { id: true, email: true, name: true, imageUrl: true, createdAt: true, accounts: { select: { provider: true } } } });
  if (!user) { res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); return; }
  res.json({ success: true, data: publicUser(user) });
}

export async function updateProfile(req: Request, res: Response): Promise<void> {
  const parsed = profileSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Enter a valid name." } }); return; }
  const user = await prisma.user.update({ where: { id: req.userId! }, data: { name: parsed.data.name }, select: { id: true, email: true, name: true, imageUrl: true, createdAt: true } });
  res.json({ success: true, data: publicUser(user) });
}

export async function changePassword(req: Request, res: Response): Promise<void> {
  const parsed = passwordSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ success: false, error: { code: "VALIDATION_ERROR", message: "Use a 12+ character password with upper, lower, and numeric characters." } }); return; }
  const account = await prisma.account.findFirst({ where: { userId: req.userId!, provider: "EMAIL_PASSWORD" }, select: { id: true, passwordHash: true } });
  if (!account?.passwordHash) { res.status(409).json({ success: false, error: { code: "PASSWORD_ACCOUNT_REQUIRED", message: "This account does not have an email and password login." } }); return; }
  if (!await argon2.verify(account.passwordHash, parsed.data.currentPassword).catch(() => false)) { res.status(401).json({ success: false, error: { code: "REAUTHENTICATION_FAILED", message: "Current password is incorrect." } }); return; }
  const passwordHash = await argon2.hash(parsed.data.newPassword, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
  await prisma.account.update({ where: { id: account.id }, data: { passwordHash } });
  res.json({ success: true, data: { changed: true } });
}

export async function logout(req: Request, res: Response): Promise<void> {
  await revokeSession(req.cookies?.cloudpilot_session);
  clearSessionCookies(req, res);
  res.status(204).send();
}

export const authRouter = Router();
const authRateLimit = rateLimit({ windowMs: 15 * 60 * 1000, limit: 10, standardHeaders: "draft-8", legacyHeaders: false, message: { success: false, error: { code: "RATE_LIMIT_EXCEEDED", message: "Too many authentication attempts. Try again later." } } });
authRouter.post("/register", authRateLimit, register);
authRouter.post("/login", authRateLimit, login);
authRouter.get("/me", requireAuth, me);
authRouter.patch("/me", requireAuth, requireCsrf, updateProfile);
authRouter.post("/password", requireAuth, requireCsrf, changePassword);
authRouter.post("/logout", requireAuth, requireCsrf, logout);
