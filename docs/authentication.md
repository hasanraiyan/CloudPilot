# Authentication and workspace API

CloudPilot supports GitHub OAuth and email/password accounts independently. Passwords are stored as Argon2id hashes. Email addresses are trimmed and lowercased before account lookup or registration.

## API endpoints

All paths below are prefixed with `/api/v1`.

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/auth/register` | Create an email/password user, account, personal workspace, owner membership, and session |
| POST | `/auth/login` | Authenticate an email/password account |
| GET | `/auth/me` | Return the authenticated profile and provider names |
| PATCH | `/auth/me` | Update the profile name (requires CSRF token) |
| POST | `/auth/password` | Change a password after checking the current password (requires CSRF token) |
| POST | `/auth/logout` | Revoke the current session and clear cookies (requires CSRF token) |
| GET | `/auth/github/start` | Begin GitHub OAuth |
| GET | `/auth/github/callback` | Complete GitHub OAuth |
| GET | `/workspaces` | List workspaces and the active workspace |
| POST | `/workspaces` | Create a personal workspace (requires CSRF token) |
| POST | `/workspaces/:id/activate` | Switch to a workspace the user belongs to (requires CSRF token) |
| GET/POST | `/projects` | List or create projects in the active workspace |
| GET/PATCH/DELETE | `/projects/:id` | Read, update, or delete a project in the active workspace |

Registration returns `emailVerification.status: "not_configured"`. No email delivery provider is configured, so CloudPilot does not claim to have verified an address.

GitHub OAuth identifies accounts by GitHub's provider account ID. A matching email alone never links a GitHub login to an existing account; the user must use the existing sign-in method until an explicit account-linking flow is implemented.

## Sessions and request protection

Sessions use random opaque tokens in the `cloudpilot_session` HttpOnly cookie. Only a SHA-256 token hash is persisted in PostgreSQL, with an expiry and revocation timestamp. Sessions expire after seven days. The `cloudpilot_csrf` cookie is readable by the browser and must match the `X-CSRF-Token` header; the server also verifies it against the authenticated session. Cookies use `SameSite=Lax` and are marked `Secure` in production.

Authentication endpoints have an additional in-memory IP rate limit of ten attempts per fifteen minutes. The existing general API rate limit also applies. For multi-instance deployments, replace in-memory limit storage with a shared store.

Configure `AUTH_SECRET` with at least 32 random characters. Set `NEXT_PUBLIC_API_URL` to the API origin (for example, `http://localhost:8000`) in the web build environment. Do not put secrets in `NEXT_PUBLIC_*` variables.

## Database changes

The additive migrations `20261124110000_revocable_sessions` and `20261124113000_workspace_projects` create revocable sessions, store the active workspace on a session, and add an optional project description. They do not reset tables or remove existing users.

Workspace isolation is enforced in API queries using the authenticated user's membership and active session workspace. Projects and deployment history are always filtered by that workspace. GitHub App repository installation, deployment execution, monitoring ingestion, cloud infrastructure automation, AI analysis, encrypted environment-variable storage, and log content display are not implemented. Log counts are available; log text remains hidden until a secret-redaction pipeline exists.
