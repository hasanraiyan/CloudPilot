# Phase 5 Architecture and Security Notes

## Audit baseline

The Phase 4 baseline is commit `5a4d095341bf9b5690100cf85282b7904e397318`. The worktree was clean before Phase 5 changes. The local API and web application responded on ports 8000 and 3000. The API readiness endpoint reported PostgreSQL and Redis healthy, and Prisma reported all existing migrations applied.

The existing Prisma schema already contains workspace-scoped `Deployment`, `Build`, `DeploymentLog`, `Project`, `Repository`, `ProjectBuildConfiguration`, `EnvironmentVariable`, and `AuditLog` models. Deployment, build, and log relations are scoped by workspace; rollback references are also scoped to the same project. Phase 5.1 extends these models additively.

The existing queue package declares deployment, build, and rollback queue names and identifier-only payload schemas. The current worker only registers the diagnostic processor; no deployment worker, worker heartbeat, source retriever, isolated builder, or container runtime exists. Redis availability is not evidence that a compatible deployment worker is available. Consequently, Phase 5.1 keeps deployment creation disabled and returns a structured `DEPLOYMENT_WORKER_UNAVAILABLE` response instead of inserting an orphaned queued record.

Authentication uses server-side sessions whose bearer token is stored as a hash. Mutating project routes require the existing CSRF cookie/header check. Workspace membership is resolved from the active session workspace and checked against the project; deployment mutations require an OWNER or ADMIN role. Existing GitHub App operations use server-side installation authorization and check installation/repository access. Phase 5.1 does not run repository code or access local Docker resources.

The API request logger initially redacted cookies but not the `X-CSRF-Token` header. The Phase 5.1 changes redact that header as well; authentication and CSRF tokens must not appear in request logs.

Environment values are stored separately from deployment records and encrypted with AES-256-GCM using workspace/project/environment/key associated data. The current ciphertext format is versioned (`v1`) and rows hold a key identifier, but the application currently configures one active encryption key. Deployment snapshots must never include environment-variable values.

Docker Desktop is installed and reports a Linux engine. This inspection did not run a Docker build or execute a container, and it did not establish the isolation guarantees required for untrusted repository code. Deployment execution therefore remains disabled until the isolation gates in later milestones are implemented and verified.

## Trust boundaries

1. **Browser to API:** Session cookies authenticate requests. CSRF validation protects mutations. Responses are scoped to the authenticated user's active workspace and project, and do not select environment-variable ciphertext or plaintext.
2. **API to PostgreSQL:** PostgreSQL is the authoritative store for lifecycle state, immutable build-configuration snapshots, idempotency keys, and audit events. State changes use conditional updates within transactions.
3. **API to GitHub:** GitHub App installation authorization is server-side. The API must resolve a requested branch to a full commit SHA before an accepted deployment is executed; callers cannot supply an arbitrary SHA as the source of truth.
4. **API to Redis/worker:** Redis jobs must contain identifiers and non-sensitive metadata only. A deployment is not accepted unless a compatible worker is actually registered and ready. PostgreSQL/Redis two-system consistency is deferred to the transactional outbox/reconciliation design in Phase 5.2.
5. **Worker to repository/build/runtime:** Repository source and build configuration are untrusted. They must not execute on the API host or receive the host Docker socket, host credentials, internal service access, or unrestricted host mounts. The build and runtime isolation model is a later release gate, not a Phase 5.1 capability.

## Deployment lifecycle

The additive lifecycle supports:

`QUEUED -> PREPARING -> CLONING -> BUILDING -> DEPLOYING -> HEALTH_CHECKING -> RUNNING`

Allowed failure/cancellation edges are `QUEUED|PENDING -> FAILED|CANCELLING|CANCELLED`, `PREPARING|CLONING|BUILDING|DEPLOYING|HEALTH_CHECKING -> FAILED|CANCELLING`, `CANCELLING -> FAILED|CANCELLED`, and `RUNNING -> FAILED|STOPPED`. The normal path may not skip stages. Existing `PENDING`, `SUCCEEDED`, and `ROLLED_BACK` values remain for compatibility. `SUCCEEDED`, `FAILED`, `CANCELLED`, `STOPPED`, and `ROLLED_BACK` are terminal. Each transition names its expected prior state and uses a conditional update in the same transaction as its audit event, preventing concurrent workers from overwriting newer or terminal state. `RUNNING` is only valid after successful health verification.

Phase 5.1 adds branch, commit-message, triggering-user, non-secret build-configuration snapshot, queue-job, failure-message, and previous-deployment fields. Previous and rollback references are protected by composite workspace/project foreign keys. A deployment's snapshot is created once and contains build settings only; environment values are resolved separately at execution time in a later milestone.

## Queue reliability and deployment acceptance gate

The current diagnostic worker is not compatible with deployment jobs. Deployment creation therefore fails closed with HTTP 503 and a stable error code until the deployment worker is available. No database record is created on this path. Phase 5.2 has now implemented durable publication using the transactional outbox pattern, deterministic job IDs, bounded retries, cancellation, stale-job reconciliation, heartbeats, and graceful shutdown. PostgreSQL remains the source of truth; Redis job state is not authoritative.

## Phase 5.1 API contract

- `GET /api/v1/projects/:projectId/deployments` returns workspace-scoped records with `page`, `perPage`, and optional lifecycle `status` filtering.
- `GET /api/v1/projects/:projectId/deployments/:deploymentId` returns a record only when it belongs to the active workspace and project.
- `POST /api/v1/projects/:projectId/deployments` requires an OWNER/ADMIN session, CSRF validation, a valid environment, and an `Idempotency-Key`. It replays an existing matching key, rejects key reuse with a different branch, and otherwise returns `503 DEPLOYMENT_WORKER_UNAVAILABLE` without creating a row.
- `POST /api/v1/projects/:projectId/deployments/:deploymentId/cancel` requires OWNER/ADMIN and CSRF validation. It atomically cancels only queued/legacy pending work and records a status audit event; concurrent cancellation attempts produce one success and one conflict.

Read endpoints require an authenticated workspace member. Responses select deployment metadata and configuration snapshots only; they never select environment-variable records.

## Isolation and secret handling

Do not execute repository-controlled commands in the API process. Before execution can be enabled, a disposable isolated Linux build environment must enforce CPU, memory, process, disk, filesystem, network, timeout, and credential boundaries. The host Docker socket must not be exposed to repository-controlled builds or deployed applications. If Docker Desktop cannot satisfy those constraints, keep deployments disabled.

Never put environment values, GitHub installation tokens, private keys, or credentials in queue payloads, deployment snapshots, URLs, build arguments, image layers, process arguments, or logs. Runtime secret injection must be limited to a trusted execution service and its limitations (including trusted host-administrator access) documented.

## Encryption-key rotation strategy

Do not rotate the currently configured environment-variable encryption key until a versioned migration is implemented. Preserve existing ciphertext by introducing a key registry keyed by the stored key identifier, retaining a decrypt-only old key while a new active key writes new values, and supporting both versions during the migration. Re-encrypt values in bounded batches using the original associated-data context, update each row only if its old ciphertext/key identifier still matches, verify row counts and decryptability, and retain a tested backup/rollback path. Retire the old key only after every ciphertext has been migrated and verified. Never reset or invalidate existing encrypted data.

## Credential-rotation checklist

- Treat credentials previously exposed outside their intended secret store as compromised; rotate the affected PostgreSQL and Redis credentials, GitHub App client secret/private key, OAuth client secret, session/authentication secret, and any deployment credentials.
- Before changing an encryption key, complete and test the versioned ciphertext migration strategy above; do not replace the key in place.
- Update local secret stores and deployment configuration without copying values into source control, logs, tickets, or this document.
- Revoke old GitHub credentials and verify the replacement installation and repository permissions.
- Revoke old database/Redis credentials only after clients have been updated and health-checked.
- Verify session invalidation expectations before rotating session/authentication material.
- Confirm no plaintext secret values were added to deployment snapshots, queue payloads, logs, or generated artifacts.

## Milestone plan and gates

1. **5.1 API/state machine:** Additive schema, conditional state transitions, authenticated project deployment endpoints, workspace authorization, CSRF, idempotency handling, pagination/status filtering, and audit events. Keep creation disabled while no compatible worker exists.
2. **5.2 Queue/worker:** Deployment queue consumer, heartbeat/readiness, transactional outbox implementation, deterministic job IDs, bounded retries, cancellation, stale-job reconciliation, heartbeats, graceful shutdown, and worker recovery tests.
3. **5.3 Source retrieval:** Revalidate GitHub installation/repository access and retrieve the exact immutable commit safely.
4. **5.4 Isolated build:** Establish and verify the disposable isolated Linux builder; Dockerfile-only first.
5. **5.5 Runtime:** Launch an isolated local container only after build/isolation gates pass.
6. **5.6 Logs:** Persist ordered, bounded, redacted logs and authorize live delivery.
7. **5.7 Health/lifecycle:** Health verification, stop/restart/redeploy/rollback, and resource cleanup.
8. **5.8 Webhooks:** Verify raw-body signatures and delivery idempotency; automatic deployment remains opt-in.
9. **5.9 End-to-end:** Test only with an explicitly trusted disposable repository, including unhealthy/failing cases and cleanup.

Each milestone requires focused tests, state/data consistency review, and a security review before moving to the next milestone. No production or public multi-tenant code execution is in scope.

## Dependency advisory

The installed dependency tree resolves `effect@3.20.0` through `prisma@7.10.1 -> @prisma/config@7.10.1`. GitHub Advisory `GHSA-7589-6fvf-x4pw` affects Effect versions through `3.22.0` and identifies `3.22.1` as patched. `@prisma/config@7.10.1` pins Effect exactly to `3.20.0`; npm audit reports the same advisory through the Prisma, config, and Effect dependency nodes and suggests a Prisma 6.12.0 major downgrade. That downgrade was rejected. An npm override was tested but the lock/install tree continued to resolve `3.20.0`, so no remediation is claimed. Revisit when Prisma publishes a compatible fixed config release or a reproducibly verified override path is available.

Phase 5.2 adds a new dependency on the transactional outbox pattern implementation and worker lifecycle management components.

## Phase 5.2 Additions

- Implemented transactional outbox pattern for reliable event publication to Redis
- Added worker lifecycle management with heartbeat mechanism
- Implemented execution leases for deployment safety
- Added retry and reconciliation policies for fault tolerance
- Worker now registers capabilities and can process deployment jobs
- Deterministic job IDs with idempotency support
- Bounded retries with exponential backoff and dead letter queue pattern
- Reconciliation service for lease expiration handling

## Phase 5.2 Limitations

- Prisma version upgrade still needed (7.10.1 -> 8.0.0-rc.35)
- Effect library vulnerability still present (fixed in prisma@6.13.0+)
- No Docker build isolation yet
- Single encryption key configuration remains
- No multi-region deployment support
- No rate limiting on deployment endpoints
