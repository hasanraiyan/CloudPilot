# CloudPilot Database

## Architecture

CloudPilot uses PostgreSQL 15 and Prisma in the `@cloudpilot/database` npm workspace.
The package provides one shared Prisma Client for `apps/api` and future `apps/worker`
processes. Browser applications must not import this package.

The initial schema models users and authentication accounts, workspaces and workspace
membership, projects and repositories, deployments and builds, deployment logs,
encrypted environment-variable values, and audit logs.

## Tenant Isolation

Every tenant-owned record includes a `workspaceId`. Deployment and build relationships
use composite foreign keys with workspace and entity identifiers so records cannot be
associated across workspaces through the database.

Application authorization remains required for every workspace operation. The database
schema provides referential integrity but does not replace authorization checks.

## Docker PostgreSQL

The root `docker-compose.yml` starts only PostgreSQL:

- Image: `postgres:15-alpine`
- Container: `cloudpilot-postgres`
- Host port: `127.0.0.1:5433`
- Container port: `5432`
- Database: `cloudpilot`
- User: `cloudpilot`
- Network: `cloudpilot-network`
- Volume: `cloudpilot_postgres_data`
- Restart policy: `unless-stopped`

The host binding is loopback-only. PostgreSQL data is retained in the named Docker volume.

## Environment

Copy `.env.example` to `.env` and supply local development values. Never commit `.env`.
`DATABASE_URL` must point to PostgreSQL port `5433` for local CloudPilot development.
OAuth tokens and other credentials must be encrypted before storage. This foundation
includes ciphertext and key-ID fields, but cryptographic encryption remains an
explicit future implementation.

## Prisma Workspace

The database workspace contains:

- `prisma/schema.prisma`
- `prisma.config.ts`
- `prisma/migrations`
- `src/index.ts`
- generated Prisma Client output under `src/generated/prisma`

The shared package exports `prisma`, `checkDatabaseHealth`, and
`disconnectDatabase`.

## Migration Commands

Run commands from the monorepo root:

```powershell
npm run db:format
npm run db:validate
npm run db:generate
npm run db:migrate -- --name <meaningful_name>
npm run db:status
npm run db:migrate:deploy
npm run db:studio
```

Do not use `prisma migrate reset` for normal development.

## Local Workflow

```powershell
docker compose up -d postgres
npm run db:generate
npm run db:status
npm run start -w @cloudpilot/api
```

The API readiness endpoint depends on PostgreSQL and reports `503` when the database
health check fails. The liveness endpoint remains independent of PostgreSQL.

## Backup Considerations

For local development, named Docker volumes should be backed up separately from source
code. Before a production migration, add encrypted managed backups, point-in-time
recovery, restore testing, retention policies, and operational recovery procedures.

## Troubleshooting

- `docker compose ps` verifies container status and health.
- `docker inspect cloudpilot-postgres --format '{{json .State.Health.Status}}'`
  verifies the PostgreSQL health status.
- `npm run db:status` checks migration synchronization.
- If port `5433` is unavailable, verify that it is not already occupied.
- If database readiness fails, confirm the container is running and `DATABASE_URL`
  points to `127.0.0.1:5433`.

## Audit Retention and Deletion

Audit records use `ON DELETE RESTRICT` for their workspace relationship. Deleting a
workspace requires an explicit approved audit-retention process and must not rely on
accidental cascading deletion.

Application code must authenticate tenant membership before reading or writing
workspace-scoped records. Composite foreign keys provide referential integrity, but
authorization remains mandatory at the application boundary.

## Environment Variables

`EnvironmentVariable` is unique by workspace, project, deployment environment, and key.
Existing records are assigned to `DEVELOPMENT` by the improvement migration. New values
must be encrypted before storage and must include an `encryptionKeyId`. Plaintext
secrets must never be written to this table.

No encryption implementation is active in this foundation. When encryption is added,
key rotation must support historical ciphertext and preserve non-plaintext storage.

## Authentication Storage

Email/password accounts may store only a password hash in `passwordHash`. OAuth
accounts store only ciphertext for access and refresh tokens, with separate key IDs.
The provider and provider-account ID remain unique per account.

Authentication endpoints and encryption operations are not implemented yet.

## Deployment Lifecycle

Deployments support environment, trigger source, idempotency key, failure code,
rollback source, project, builds, logs, and lifecycle timestamps. Idempotency is
workspace/project/environment scoped. Builds may reference artifacts and container
images, including immutable image digests.

Rollback deployments reference only deployments in the same workspace and project.
Composite foreign-key relationships reject cross-project or cross-workspace rollback
links.

## Deployment and Log Optimization

Deployment history indexes cover workspace/project/time, workspace/status/time,
and workspace/environment/time. Log retrieval uses workspace/deployment/time and
workspace/deployment/sequence indexes.

`DeploymentLog.sequence` is PostgreSQL `BIGINT`; JSON API responses must serialize it
as a string when JavaScript precision could otherwise truncate it. Deployment log
messages must pass secret redaction before storage or API transmission.

## Tenant Isolation

Tenant-owned records are workspace-scoped. Reading or mutating a record requires
workspace membership and authorization for the requested role. Composite foreign keys
prevent inconsistent cross-workspace relations where implemented, but application
authorization remains the required security boundary.

## Migration History

- `20261124081124_init_database_foundation`: initial foundational schema.
- `20261124093000_improve_database_foundation`: environment-aware variables,
  authentication metadata, deployment lifecycle fields, rollback relationships,
  build references, and audit history protection.
