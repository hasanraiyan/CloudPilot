# CloudPilot Redis and BullMQ Foundation

## Architecture

Redis 7 runs in Docker with AOF persistence and loopback-only host exposure.
BullMQ queues use the `@cloudpilot/queue` workspace, and `@cloudpilot/worker`
provides isolated background processors.

The API uses a bounded producer Redis connection. Workers use worker-oriented
Redis retry behavior. Neither Redis nor BullMQ queue services are exposed to the
browser frontend.

## Queue Contracts

The queue package provides typed and Zod-validated contracts for:

- Deployment
- Build
- Rollback
- Internal diagnostic

All contract IDs are identifiers or UUIDs. Queue payloads must not contain
passwords, access tokens, refresh tokens, or environment secrets.

## Reliability

Jobs support exponential backoff, configurable attempts, concurrency, execution
timeouts, completed-job retention, and failed-job retention. Permanent diagnostic
and invalid payload errors are not retried. Transient errors use exponential retry.

BullMQ uses at-least-once execution semantics. A processor must remain safe when
the same job is delivered more than once.

Deterministic job IDs deduplicate identical queue submissions. PostgreSQL
deployment idempotency keys provide a second database-level boundary. Future
transactional-outbox or reconciliation logic will coordinate database and queue
state so queue retries do not create inconsistent deployments.

Deployment and rollback operations must be idempotent at every external side
effect. Non-idempotent operations must not be automatically retried.

## Redis Persistence

Redis uses AOF with `everysec` fsync and a named Docker volume.
`maxmemory-policy=noeviction` prevents BullMQ reliability from silently discarding
queue state when memory is constrained.

## Worker Lifecycle

The worker process validates environment configuration, starts BullMQ workers,
logs lifecycle events, handles Redis and processor failures, and performs bounded
SIGINT/SIGTERM shutdown cleanup.

The worker does not execute shell commands, clone repositories, build images,
or perform deployment operations in this phase.

## API Readiness

Readiness requires PostgreSQL and Redis to respond within bounded health-check
timeouts. Liveness remains independent of either dependency.

Redis or PostgreSQL failure returns HTTP 503. Recovery restores HTTP 200 readiness.

## Local Commands

```powershell
docker compose up -d redis
npm run queue:typecheck
npm run queue:build
npm run worker:typecheck
npm run worker:build
npm run worker:start
npm run queue:diagnostic
docker compose ps
```

Redis and PostgreSQL credentials remain in ignored local environment files.
Redis is bound to `127.0.0.1:6379`.

## Execution Deadlines and Cancellation

QueueManager timers invoke BullMQ cooperative cancellation and pass `AbortSignal`
to processors. Processors must observe cancellation and stop or unwind cancellation-aware
operations. A Promise race is not a cancellation mechanism.

BullMQ `lockDuration` remains a stall-detection lease. It is not used as the execution
deadline.

## Permanent and Transient Failures

Permanent processor failures use BullMQ `UnrecoverableError`, so BullMQ moves the job
to failed state without consuming additional retry attempts. Transient failures use
exponential backoff.

Diagnostic jobs may retry. Deployment, build, and rollback jobs default to one attempt.
Future deployment processors must use PostgreSQL-backed idempotency and must not
automatically retry non-idempotent operations.

## Job IDs and Deduplication

External job IDs are restricted to letters, numbers, `_`, and `-`. QueueManager provides
deterministic IDs from queue name and canonical identifiers.

BullMQ deduplication only covers retained job records. Once completed or failed records
are removed, submitting the same deterministic ID can create a new job. PostgreSQL
deployment idempotency remains the durable cross-system deduplication boundary.

## Connection Ownership

The API producer owns its Redis connection and closes it during bounded, idempotent
QueueManager shutdown. The worker owns its worker Redis connection and closes it
through worker shutdown. A shared connection must not be closed by both owners.
