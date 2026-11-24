import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { prisma } from "@cloudpilot/database";
import { clearSessionCookies, CSRF_COOKIE, hashSecret, SESSION_COOKIE } from "../services/session.service.js";

declare global {
  namespace Express { interface Request { userId?: string; sessionId?: string } }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = req.cookies?.[SESSION_COOKIE];
  if (typeof token !== "string" || token.length > 256) {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); return;
  }
  try {
    const session = await prisma.session.findUnique({ where: { tokenHash: hashSecret(token) }, select: { id: true, userId: true, csrfHash: true, expiresAt: true, revokedAt: true } });
    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      clearSessionCookies(req, res);
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } }); return;
    }
    req.userId = session.userId;
    req.sessionId = session.id;
    res.locals.sessionCsrfHash = session.csrfHash;
    next();
  } catch { res.status(503).json({ success: false, error: { code: "DEPENDENCY_NOT_READY", message: "Authentication lookup unavailable." } }); }
}

export function requireCsrf(req: Request, res: Response, next: NextFunction): void {
  const cookie = req.cookies?.[CSRF_COOKIE];
  const header = req.get("x-csrf-token");
  if (typeof cookie !== "string" || typeof header !== "string" || cookie !== header || !res.locals.sessionCsrfHash) {
    res.status(403).json({ success: false, error: { code: "CSRF_INVALID", message: "Request could not be verified." } }); return;
  }
  const actual = Buffer.from(hashSecret(cookie));
  const expected = Buffer.from(res.locals.sessionCsrfHash as string);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    res.status(403).json({ success: false, error: { code: "CSRF_INVALID", message: "Request could not be verified." } }); return;
  }
  next();
}
