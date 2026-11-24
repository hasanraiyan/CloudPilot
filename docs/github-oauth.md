# GitHub OAuth Setup

## GitHub OAuth App

Create a GitHub OAuth App in GitHub Developer Settings:

- Homepage URL: `http://localhost:3000`
- Authorization callback URL: `http://localhost:8000/api/v1/auth/github/callback`

Add the generated values to the root ignored `.env` file:

```text
GITHUB_CLIENT_ID=<OAuth App client ID>
GITHUB_CLIENT_SECRET=<OAuth App client secret>
GITHUB_CALLBACK_URL=http://localhost:8000/api/v1/auth/github/callback
AUTH_SECRET=<random 32-character-or-longer value>
```

The secret must not be committed. The API redirects to the frontend through the
configured CORS origin after OAuth completion.

## API Flow

1. `GET /api/v1/auth/github/start`
2. GitHub redirects to the callback URL
3. `GET /api/v1/auth/github/callback`
4. The API resolves the CloudPilot account by GitHub provider account ID
5. The API creates a revocable server-side session and HTTP-only cookie
6. The browser redirects to `/dashboard`

If the verified GitHub email belongs to a CloudPilot account without this GitHub
provider identity, sign-in stops with an account conflict. Matching emails are not
automatically linked.

## Logout and Session

- `POST /api/v1/auth/logout` revokes the current session and clears both cookies.
- `GET /api/v1/auth/me` validates the server-side session and returns the user.
- `POST /api/v1/auth/github/logout` remains as a protected compatibility route.
- `GET /api/v1/auth/github/me` remains available for compatibility.

GitHub access tokens are not persisted as plaintext. OAuth user/account identity is
stored through the existing Prisma `User` and `Account` models. OAuth sessions are
stored in the additive `sessions` table; GitHub tokens are not persisted.
