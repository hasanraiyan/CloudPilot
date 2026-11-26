import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import type {
  OAuthClientInformationFull,
  OAuthTokenRevocationRequest,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { prisma } from "@cloudpilot/database";
import { env } from "../../config/env.js";
import { hashSecret, SESSION_COOKIE } from "../../services/session.service.js";

type StoredAuthCode = {
  clientId: string;
  userId: string;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
};

type TokenPayload = {
  kind: "access" | "refresh";
  sub: string;
  clientId: string;
  scopes: string[];
  resource?: string;
  jti: string;
  exp: number;
};

const ACCESS_TTL_SEC = 3600;
const REFRESH_TTL_SEC = 30 * 24 * 3600;
const CODE_TTL_MS = 5 * 60 * 1000;

const clients = new Map<string, OAuthClientInformationFull>();
const authCodes = new Map<string, StoredAuthCode>();
const revokedTokenIds = new Set<string>();
const ephemeralSecret = randomBytes(32).toString("hex");

function signingSecret(): string {
  return env.AUTH_SECRET ?? ephemeralSecret;
}

function signToken(payload: TokenPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return `${encoded}.${sig}`;
}

function verifySignedToken(token: string, expectedKind: "access" | "refresh"): TokenPayload {
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Malformed token");
  const [encoded, sig] = parts;
  if (!encoded || !sig) throw new Error("Malformed token");

  const expectedSig = createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  const actualBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expectedSig);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new Error("Invalid token signature");
  }

  const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as TokenPayload;
  if (payload.kind !== expectedKind) throw new Error("Invalid token type");
  if (revokedTokenIds.has(payload.jti)) throw new Error("Token revoked");
  if (payload.exp <= Math.floor(Date.now() / 1000)) throw new Error("Token expired");
  return payload;
}

class InMemoryClientsStore implements OAuthRegisteredClientsStore {
  getClient(clientId: string): OAuthClientInformationFull | undefined {
    return clients.get(clientId);
  }

  registerClient(
    clientMetadata: Omit<OAuthClientInformationFull, "client_id" | "client_id_issued_at">,
  ): OAuthClientInformationFull {
    const client: OAuthClientInformationFull = {
      ...clientMetadata,
      client_id: `cp_${randomBytes(12).toString("hex")}`,
      client_id_issued_at: Math.floor(Date.now() / 1000),
    };
    clients.set(client.client_id, client);
    return client;
  }
}

export class CloudPilotOAuthProvider implements OAuthServerProvider {
  private readonly _clientsStore = new InMemoryClientsStore();

  get clientsStore(): OAuthRegisteredClientsStore {
    return this._clientsStore;
  }

  async authorize(
    client: OAuthClientInformationFull,
    params: AuthorizationParams,
    res: Response,
  ): Promise<void> {
    const rawCookie = (res.req as { cookies?: Record<string, unknown> } | undefined)?.cookies?.[SESSION_COOKIE];
    let userId: string | null = null;

    if (typeof rawCookie === "string" && rawCookie.length <= 256) {
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashSecret(rawCookie) },
        select: { userId: true, expiresAt: true, revokedAt: true },
      });
      if (session && !session.revokedAt && session.expiresAt > new Date()) {
        userId = session.userId;
      }
    }

    if (!userId) {
      const webOrigin = env.corsOrigins[0] ?? "http://localhost:3000";
      const loginUrl = new URL("/login", webOrigin);
      const currentReq = res.req as { originalUrl?: string } | undefined;
      if (currentReq?.originalUrl) {
        loginUrl.searchParams.set("next", `${env.MCP_PUBLIC_URL ?? `http://${env.HOST}:${env.PORT}`}${currentReq.originalUrl}`);
      }
      res.redirect(loginUrl.toString());
      return;
    }

    const code = randomBytes(24).toString("base64url");
    authCodes.set(code, {
      clientId: client.client_id,
      userId,
      codeChallenge: params.codeChallenge,
      redirectUri: params.redirectUri,
      scopes: params.scopes ?? ["cloudpilot:read"],
      ...(params.resource ? { resource: params.resource.toString() } : {}),
      expiresAt: Date.now() + CODE_TTL_MS,
    });

    const target = new URL(params.redirectUri);
    target.searchParams.set("code", code);
    if (params.state) {
      target.searchParams.set("state", params.state);
    }
    res.redirect(target.toString());
  }

  async challengeForAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
  ): Promise<string> {
    const record = authCodes.get(authorizationCode);
    if (!record || record.clientId !== client.client_id || record.expiresAt <= Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }
    return record.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string,
    resource?: URL,
  ): Promise<OAuthTokens> {
    const record = authCodes.get(authorizationCode);
    if (!record || record.clientId !== client.client_id || record.expiresAt <= Date.now()) {
      throw new Error("Invalid or expired authorization code");
    }
    if (redirectUri && record.redirectUri !== redirectUri) {
      throw new Error("Redirect URI mismatch");
    }
    authCodes.delete(authorizationCode);

    const nowSec = Math.floor(Date.now() / 1000);
    const resolvedResource = resource?.toString() ?? record.resource;

    const accessToken = signToken({
      kind: "access",
      sub: record.userId,
      clientId: client.client_id,
      scopes: record.scopes,
      ...(resolvedResource ? { resource: resolvedResource } : {}),
      jti: randomBytes(12).toString("hex"),
      exp: nowSec + ACCESS_TTL_SEC,
    });

    const refreshToken = signToken({
      kind: "refresh",
      sub: record.userId,
      clientId: client.client_id,
      scopes: record.scopes,
      ...(resolvedResource ? { resource: resolvedResource } : {}),
      jti: randomBytes(12).toString("hex"),
      exp: nowSec + REFRESH_TTL_SEC,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refreshToken,
      scope: record.scopes.join(" "),
    };
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[],
    resource?: URL,
  ): Promise<OAuthTokens> {
    const payload = verifySignedToken(refreshToken, "refresh");
    if (payload.clientId !== client.client_id) {
      throw new Error("Client mismatch");
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const nextScopes = scopes && scopes.length > 0 ? scopes : payload.scopes;
    const resolvedResource = resource?.toString() ?? payload.resource;

    const accessToken = signToken({
      kind: "access",
      sub: payload.sub,
      clientId: client.client_id,
      scopes: nextScopes,
      ...(resolvedResource ? { resource: resolvedResource } : {}),
      jti: randomBytes(12).toString("hex"),
      exp: nowSec + ACCESS_TTL_SEC,
    });

    return {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: ACCESS_TTL_SEC,
      refresh_token: refreshToken,
      scope: nextScopes.join(" "),
    };
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const payload = verifySignedToken(token, "access");
    return {
      token,
      clientId: payload.clientId,
      scopes: payload.scopes,
      expiresAt: payload.exp,
      ...(payload.resource ? { resource: new URL(payload.resource) } : {}),
      extra: { userId: payload.sub },
    };
  }

  async revokeToken(
    _client: OAuthClientInformationFull,
    request: OAuthTokenRevocationRequest,
  ): Promise<void> {
    try {
      const kind = request.token_type_hint === "refresh_token" ? "refresh" : "access";
      const payload = verifySignedToken(request.token, kind);
      revokedTokenIds.add(payload.jti);
    } catch {
      // RFC 7009: invalid/already-revoked tokens succeed silently
    }
  }
}

export const cloudpilotOAuthProvider = new CloudPilotOAuthProvider();
