import { createHash, randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { prisma } from "@cloudpilot/database";
import { env } from "../config/env.js";

export const SESSION_COOKIE = "cloudpilot_session";
export const CSRF_COOKIE = "cloudpilot_csrf";
const SESSION_AGE = 7 * 24 * 60 * 60 * 1000;
export const hashSecret = (value: string) => createHash("sha256").update(value).digest("hex");

function cookieOptions() {
  return { httpOnly: true, secure: env.NODE_ENV === "production", sameSite: "lax" as const, path: "/" };
}

export async function createSession(userId: string, res: Response): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const csrf = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_AGE);
  const membership = await prisma.workspaceMember.findFirst({ where: { userId }, orderBy: { createdAt: "asc" }, select: { workspaceId: true } });
  await prisma.session.create({ data: { userId, tokenHash: hashSecret(token), csrfHash: hashSecret(csrf), expiresAt, activeWorkspaceId: membership?.workspaceId ?? null } });
  res.cookie(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_AGE });
  res.cookie(CSRF_COOKIE, csrf, { ...cookieOptions(), httpOnly: false, maxAge: SESSION_AGE });
}

export async function revokeSession(token: unknown): Promise<void> {
  if (typeof token !== "string" || token.length > 256) return;
  await prisma.session.updateMany({ where: { tokenHash: hashSecret(token), revokedAt: null }, data: { revokedAt: new Date() } });
}

export function clearSessionCookies(req: Request, res: Response): void {
  const options = { ...cookieOptions(), domain: undefined };
  res.clearCookie(SESSION_COOKIE, options);
  res.clearCookie(CSRF_COOKIE, { ...options, httpOnly: false });
}
