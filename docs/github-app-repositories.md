# GitHub App repository integration

CloudPilot connects a GitHub App installation to the active workspace. Installation IDs are accepted only as lookup keys: the API verifies each installation with an App JWT and requires a GitHub user OAuth authorization that can independently see the same installation. No email address is used to associate GitHub and CloudPilot accounts.

## Configuration

Set these values in the local, ignored `.env` file:

```dotenv
GITHUB_APP_ID=your-numeric-app-id
GITHUB_APP_SLUG=your-app-slug
GITHUB_APP_PRIVATE_KEY_PATH=C:/path/outside/the/repository/github-app.pem
GITHUB_APP_CLIENT_ID=your-github-app-client-id
GITHUB_APP_CLIENT_SECRET=your-github-app-client-secret
GITHUB_INSTALLATION_OAUTH_CALLBACK_URL=http://localhost:8000/api/v1/github/installations/authorize/callback
```

Keep the existing `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `GITHUB_CALLBACK_URL` unchanged for GitHub OAuth login. GitHub App user authorization uses the separate `GITHUB_APP_CLIENT_ID` and `GITHUB_APP_CLIENT_SECRET` from the GitHub App's settings. The App client ID is distinct from the numeric App ID and the existing OAuth client ID. The RSA App key remains at the configured private key path.

In GitHub App settings, set **Setup URL** to:

```text
http://localhost:8000/api/v1/github/installations/callback
```

Add the **User authorization callback URL** above to the GitHub App callback URL list. The API's repository selection uses the App installation token, so grant the App `Metadata: Read-only` and `Contents: Read-only` repository permissions. GitHub App authorization uses the App's configured fine-grained permissions and does not request OAuth scopes. Keep webhook delivery disabled until a signed, public webhook endpoint is implemented.

Keep the RSA key outside the repository. `.env`, `.pem`, `.key`, PKCS#12, and certificate files are ignored by Git. The API reads and validates the RSA private key when creating an App client. Installation tokens are minted by Octokit's App authentication and are never stored or returned.

## Authorization flow

1. A signed-in workspace owner or admin selects **Connect GitHub App**. CloudPilot creates a random state, stores only its SHA-256 hash with the current user, session, workspace, and a ten-minute expiry, then redirects to GitHub's install/update page.
2. GitHub returns `installation_id`, `setup_action`, and state to the Setup URL. CloudPilot consumes the state once, verifies the App installation through GitHub's App API, and starts GitHub user authorization.
3. The OAuth callback is bound to the same CloudPilot user and session. CloudPilot exchanges the code, reads the GitHub account ID, and asks GitHub whether that identity can access the exact installation. It then associates the GitHub provider ID with the signed-in CloudPilot user, without email matching, and stores the workspace installation record.
4. Repository and branch requests check active workspace membership, the linked authorizing GitHub identity, the installation's App ownership/status, and current repository access using fresh short-lived installation tokens.

Each state expires after ten minutes and can be consumed once. OAuth access tokens are used in memory only for identity/installation verification and are discarded. Reauthorizing an installation already in the same workspace updates its metadata; an installation connected to a different workspace is rejected instead of silently moved.

## API routes

- `GET /api/v1/github/installations/start`
- `GET /api/v1/github/installations/callback`
- `GET /api/v1/github/installations/authorize/callback` (GitHub user authorization return)
- `GET /api/v1/github/installations`
- `GET /api/v1/github/installations/:id/repositories`
- `GET /api/v1/github/installations/:id/repositories/:repositoryId/branches`
- `POST /api/v1/github/installations/:id/repositories/:repositoryId/import`

All routes require a valid CloudPilot session. Import also requires CSRF validation and an owner/admin role. Import re-fetches repository and branch access before a transaction creates the workspace project and repository record. Database uniqueness constraints prevent duplicate imports. No deployment is started.

GitHub IDs are serialized as decimal strings to avoid JavaScript precision loss. Repository names, visibility, language, and branches come from GitHub's API; installation access is paginated by Octokit.

## Local manual verification

1. Add the GitHub App client ID, client secret, and user authorization callback URL to the local `.env` as shown above; do not replace the existing OAuth login credentials. Confirm the App's setup URL and user authorization callback URL exactly match the two URLs above; confirm the App is installed on the intended account and has read-only Contents/Metadata permissions.
2. Start PostgreSQL and Redis, then apply the additive database migration with `npm run db:migrate:deploy`.
3. Start the API and web app and sign in to CloudPilot as a workspace owner/admin.
4. Open **Dashboard → Projects → Connect GitHub App**. For an existing manually created installation, choose **Update** on GitHub's installation page if prompted; no installation ID needs to be entered into CloudPilot.
5. Authorize the GitHub account that manages that installation. The browser should return to Projects with a connected notice.
6. Select **Import GitHub Repository**, choose the account, search for a real repository, select a branch, set a project name, and import.
7. Repeat the import to confirm duplicate rejection; try a user without the authorizing GitHub identity and confirm repository access is denied. Confirm the imported project shows its actual private/public status and selected branch.
