import type { Request, Response } from "express";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@cloudpilot/database";
import { env } from "../config/env.js";
import { createSession, clearSessionCookies, revokeSession } from "../services/session.service.js";

const STATE_COOKIE = "cloudpilot_oauth_state";

interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
  email?: string | null;
  avatar_url?: string | null;
}

interface GitHubEmail {
  email: string;
  primary: boolean;
  verified: boolean;
}

function baseCookieOptions(req: Request) {
  return {
    httpOnly: true,
    secure: env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
}

function sign(value: string): string {
  if (!env.AUTH_SECRET) {
    throw new Error("AUTH_SECRET is not configured");
  }
  return createHmac("sha256", env.AUTH_SECRET).update(value).digest("base64url");
}

function signedValue(value: string): string {
  return `${value}.${sign(value)}`;
}

function verifySignedValue(value: string | undefined): string | null {
  if (!value || !env.AUTH_SECRET) return null;
  const separator = value.lastIndexOf(".");
  if (separator <= 0) return null;
  const payload = value.slice(0, separator);
  const signature = value.slice(separator + 1);
  const expected = sign(payload);
  const providedBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length) return null;
  if (!timingSafeEqual(providedBuffer, expectedBuffer)) return null;
  return payload;
}

function authConfigured(): boolean {
  const placeholderValues = [
    "replace-with-your-github-oauth-client-id",
    "replace-with-your-github-oauth-client-secret",
  ];
  return Boolean(
    env.GITHUB_CLIENT_ID &&
    env.GITHUB_CLIENT_SECRET &&
    env.GITHUB_CALLBACK_URL &&
    env.AUTH_SECRET &&
    !placeholderValues.includes(env.GITHUB_CLIENT_ID) &&
    !placeholderValues.includes(env.GITHUB_CLIENT_SECRET) &&
    !env.AUTH_SECRET.startsWith("replace-with-"),
  );
}

function frontendUrl(path: string): string {
  return `${env.corsOrigins[0] ?? "http://localhost:3000"}${path}`;
}

export function githubStart(req: Request, res: Response): void {
  if (!authConfigured()) {
    res.redirect(frontendUrl("/login?oauth_error=configuration"));
    return;
  }

  const state = randomBytes(24).toString("base64url");
  res.cookie(STATE_COOKIE, signedValue(state), {
    ...baseCookieOptions(req),
    maxAge: 10 * 60 * 1000,
  });

  const authorizeUrl = new URL("https://github.com/login/oauth/authorize");
  authorizeUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID!);
  authorizeUrl.searchParams.set("redirect_uri", env.GITHUB_CALLBACK_URL!);
  authorizeUrl.searchParams.set("scope", "read:user user:email");
  authorizeUrl.searchParams.set("state", state);
  res.redirect(authorizeUrl.toString());
}

export async function githubCallback(req: Request, res: Response): Promise<void> {
  if (!authConfigured()) {
    res.redirect(frontendUrl("/login?oauth_error=configuration"));
    return;
  }

  const code = typeof req.query.code === "string" ? req.query.code : null;
  const state = typeof req.query.state === "string" ? req.query.state : null;
  const stateCookie = verifySignedValue(req.cookies[STATE_COOKIE] as string | undefined);

  if (!code || !state || !stateCookie || stateCookie !== state) {
    res.clearCookie(STATE_COOKIE, baseCookieOptions(req));
    res.redirect(frontendUrl("/login?oauth_error=invalid_state"));
    return;
  }

  res.clearCookie(STATE_COOKIE, baseCookieOptions(req));

  try {
    const tokenResponse = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: env.GITHUB_CALLBACK_URL,
      }),
    });

    if (!tokenResponse.ok) throw new Error("GitHub token exchange failed");
    const tokenData = await tokenResponse.json() as { access_token?: string; error?: string };
    if (!tokenData.access_token) throw new Error(tokenData.error ?? "GitHub did not return an access token");

    const userResponse = await fetch("https://api.github.com/user", {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${tokenData.access_token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    if (!userResponse.ok) throw new Error("GitHub profile fetch failed");
    const githubUser = await userResponse.json() as GitHubUser;

    let email = githubUser.email ?? null;
    if (!email) {
      const emailResponse = await fetch("https://api.github.com/user/emails", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${tokenData.access_token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (emailResponse.ok) {
        const emails = await emailResponse.json() as GitHubEmail[];
        email = emails.find((item) => item.primary && item.verified)?.email ?? null;
      }
    }
    if (!email) throw new Error("A verified GitHub email is required");

    const providerAccountId = String(githubUser.id);
    const existingAccount = await prisma.account.findUnique({
      where: { provider_providerAccountId: { provider: "GITHUB", providerAccountId } },
      select: { userId: true },
    });
    let user;
    if (existingAccount) {
      user = await prisma.user.update({
        where: { id: existingAccount.userId },
        data: { name: githubUser.name ?? githubUser.login, imageUrl: githubUser.avatar_url ?? null },
      });
    } else {
      const emailOwner = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } });
      if (emailOwner) {
        res.redirect(frontendUrl("/login?oauth_error=account_conflict"));
        return;
      }
      user = await prisma.$transaction(async (tx) => {
        const created = await tx.user.create({ data: { email: email.toLowerCase(), name: githubUser.name ?? githubUser.login, imageUrl: githubUser.avatar_url ?? null } });
        await tx.account.create({ data: { userId: created.id, provider: "GITHUB", providerAccountId } });
        const base = `${(githubUser.login.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "github")}-personal`;
        let slug = base;
        let suffix = 2;
        while (await tx.workspace.findUnique({ where: { slug }, select: { id: true } })) slug = `${base}-${suffix++}`;
        const workspace = await tx.workspace.create({ data: { name: `${created.name ?? githubUser.login}'s Workspace`, slug } });
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: created.id, role: "OWNER" } });
        return created;
      });
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${user.id})) IS NULL`;
      const membership = await tx.workspaceMember.findFirst({ where: { userId: user.id }, select: { workspaceId: true } });
      if (!membership) {
        const base = `${(githubUser.login.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "github")}-personal`;
        let slug = base; let suffix = 2;
        while (await tx.workspace.findUnique({ where: { slug }, select: { id: true } })) slug = `${base}-${suffix++}`;
        const workspace = await tx.workspace.create({ data: { name: `${user.name ?? githubUser.login}'s Workspace`, slug } });
        await tx.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
      }
    });
    await createSession(user.id, res);
    res.redirect(frontendUrl("/dashboard"));
  } catch (error) {
    res.redirect(frontendUrl("/login?oauth_error=oauth_failed"));
  }
}

export async function githubMe(req: Request, res: Response): Promise<void> {
  const token = req.cookies?.cloudpilot_session;
  if (typeof token !== "string") {
    res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } });
    return;
  }
  try {
    const { hashSecret } = await import("../services/session.service.js");
    const session = await prisma.session.findUnique({ where: { tokenHash: hashSecret(token), revokedAt: null }, select: { userId: true, expiresAt: true } });
    const user = session && session.expiresAt > new Date() ? await prisma.user.findUnique({
      where: { id: session.userId },
      select: { id: true, email: true, name: true, imageUrl: true, createdAt: true, accounts: { select: { provider: true } } },
    }) : null;
    if (!user) {
      res.status(401).json({ success: false, error: { code: "UNAUTHORIZED", message: "Authentication required." } });
      return;
    }
    res.status(200).json({ success: true, data: { ...user, providers: user.accounts.map((account) => account.provider) } });
  } catch {
    res.status(503).json({ success: false, error: { code: "DEPENDENCY_NOT_READY", message: "Authentication lookup unavailable." } });
  }
}

export async function githubLogout(req: Request, res: Response): Promise<void> {
  await revokeSession(req.cookies?.cloudpilot_session);
  clearSessionCookies(req, res);
  res.status(204).send();
}
