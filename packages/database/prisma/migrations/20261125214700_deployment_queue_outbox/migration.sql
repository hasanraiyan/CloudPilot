CREATE TYPE "DeploymentOutboxStatus" AS ENUM ('PENDING', 'PUBLISHING', 'PUBLISHED', 'DEAD');
CREATE TYPE "DeploymentOutboxEventType" AS ENUM ('DEPLOYMENT_REQUESTED');

ALTER TABLE "deployments"
  ADD COLUMN "executionLeaseToken" UUID,
  ADD COLUMN "executionLeaseExpiresAt" TIMESTAMP(3),
  ADD COLUMN "executionAttempt" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX "deployments_status_executionLeaseExpiresAt_idx"
  ON "deployments"("status", "executionLeaseExpiresAt");

CREATE TABLE "deployment_outbox_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "deploymentId" UUID NOT NULL,
  "eventType" "DeploymentOutboxEventType" NOT NULL,
  "status" "DeploymentOutboxStatus" NOT NULL DEFAULT 'PENDING',
  "jobId" VARCHAR(128) NOT NULL,
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "leaseToken" UUID,
  "leaseExpiresAt" TIMESTAMP(3),
  "publishedAt" TIMESTAMP(3),
  "lastErrorCode" VARCHAR(80),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "deployment_outbox_events_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "deployment_outbox_events_jobId_key"
  ON "deployment_outbox_events"("jobId");
CREATE UNIQUE INDEX "deployment_outbox_events_workspaceId_projectId_deploymentId_eventType_key"
  ON "deployment_outbox_events"("workspaceId", "projectId", "deploymentId", "eventType");
CREATE INDEX "deployment_outbox_events_status_nextAttemptAt_createdAt_idx"
  ON "deployment_outbox_events"("status", "nextAttemptAt", "createdAt");
CREATE INDEX "deployment_outbox_events_status_leaseExpiresAt_idx"
  ON "deployment_outbox_events"("status", "leaseExpiresAt");
CREATE INDEX "deployment_outbox_events_workspaceId_projectId_createdAt_idx"
  ON "deployment_outbox_events"("workspaceId", "projectId", "createdAt");

ALTER TABLE "deployment_outbox_events"
  ADD CONSTRAINT "deployment_outbox_events_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_outbox_events"
  ADD CONSTRAINT "deployment_outbox_events_workspaceId_projectId_fkey"
  FOREIGN KEY ("workspaceId", "projectId") REFERENCES "projects"("workspaceId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "deployment_outbox_events"
  ADD CONSTRAINT "deployment_outbox_events_workspaceId_projectId_deploymentId_fkey"
  FOREIGN KEY ("workspaceId", "projectId", "deploymentId")
  REFERENCES "deployments"("workspaceId", "projectId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
