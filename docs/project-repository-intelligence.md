# Project repository intelligence

Repository intelligence is served by the authenticated API under `/api/v1/projects/:projectId`.

| Method | Path | Behavior |
| --- | --- | --- |
| GET | `/repository` | Current verified GitHub repository metadata and installation permissions |
| GET | `/repository/commits` | Branch-specific, paginated commit history |
| GET | `/repository/commits/latest` | Latest commit for the selected/requested branch |
| GET | `/repository/commits/:sha` | Commit summary, verification, changed file names, and additions/deletions |
| GET | `/repository/branches` | Paginated/searchable branches and default/selected branch |
| GET | `/repository/tags` | Paginated repository tags |
| GET | `/repository/files` | Read-only branch file listing or safe text preview |
| GET | `/repository/languages` | GitHub language byte counts and percentages |
| GET | `/repository/detection` | Read-only framework/runtime and build command suggestions |
| POST | `/repository/refresh` | Revalidate access and refresh persisted metadata (OWNER/ADMIN, CSRF required) |
| PATCH | `/repository/branch` | Verify a live branch and set the project branch (OWNER/ADMIN, CSRF required) |
| GET | `/build-config` | Persisted build settings and saved state |
| PUT | `/build-config` | Validate and save settings (OWNER/ADMIN, CSRF required) |
| DELETE | `/build-config` | Reset settings (OWNER/ADMIN, CSRF required) |
| GET | `/environment-variables` | Variable IDs, names, scopes, timestamps, and count. Filter with `?environment=PREVIEW`. |
| POST | `/environment-variables` | Create a variable with `key`, `environment`, and `value` (OWNER/ADMIN, CSRF required) |
| PATCH | `/environment-variables/:variableId` | Replace a variable's `value` (OWNER/ADMIN, CSRF required) |
| DELETE | `/environment-variables/:variableId` | Delete a variable (OWNER/ADMIN, CSRF required) |

Every route requires the existing server-side session. The API resolves the project inside the active workspace and validates the GitHub App installation and repository access before serving repository data. GitHub App access tokens remain server-side. The app needs **Metadata: read-only** and **Contents: read-only** permissions for metadata, language, commit, branch, tag, and file APIs. No webhook or deployment permission is required.

Redis stores workspace/project-scoped response caches with short expirations; GitHub installation access and repository membership are rechecked before cached repository data is returned. Cache misses and Redis outages fall back to GitHub directly. Framework/build detection only reads repository files and produces suggestions; it never executes a command. File preview excludes credential paths, limits text to 128 KiB, and renders as plain text in the web app.

Detected values are editable drafts. When multiple package directories are detected in a monorepo, enter the application directory and application-specific commands before saving. Build configuration stores the package manager alongside the existing settings.

## Environment variable encryption

Set `ENVIRONMENT_VARIABLE_ENCRYPTION_KEY` on the API server to a randomly generated 32-byte key encoded as 64 hexadecimal characters. Store it in the backend secret manager and use the same key on all API instances. Keep a secure backup of every key used for stored values. Each write uses AES-256-GCM with a fresh nonce and authenticates the workspace, project, scope, and variable name. The database stores the encrypted envelope and key identifier. Responses and audit records contain variable metadata only. Key replacement affects future writes. Existing entries retain their original key identifier and require their original key for future decryption.
