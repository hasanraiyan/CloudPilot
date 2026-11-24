-- CreateEnum
CREATE TYPE "DeploymentTriggerSource" AS ENUM ('MANUAL', 'GITHUB_PUSH', 'GITHUB_PULL_REQUEST', 'SCHEDULE', 'API', 'ROLLBACK');

-- CreateEnum
CREATE TYPE "DeploymentFailureCode" AS ENUM ('BUILD_FAILED', 'DEPLOY_FAILED', 'HEALTH_CHECK_FAILED', 'TIMEOUT', 'CANCELLED', 'UNKNOWN');

-- AlterTable
ALTER TABLE "accounts"
  ADD COLUMN "passwordHash" TEXT,
  ADD COLUMN "accessTokenKeyId" TEXT,
  ADD COLUMN "refreshTokenKeyId" TEXT;

-- AlterTable
ALTER TABLE "deployments"
  ADD COLUMN "triggerSource" "DeploymentTriggerSource" NOT NULL DEFAULT 'API',
  ADD COLUMN "failureCode" "DeploymentFailureCode",
  ADD COLUMN "idempotencyKey" TEXT,
  ADD COLUMN "rollbackOfId" UUID;

-- AlterTable
ALTER TABLE "builds"
  ADD COLUMN "artifactReference" TEXT,
  ADD COLUMN "imageReference" TEXT,
  ADD COLUMN "immutableImageDigest" TEXT;

-- AlterTable
ALTER TABLE "environment_variables"
  ADD COLUMN "environment" "DeploymentEnvironment" NOT NULL DEFAULT 'DEVELOPMENT';

-- Preserve existing environment variable records in DEVELOPMENT.
-- Replace environment-agnostic uniqueness with environment-aware uniqueness.
DROP INDEX "environment_variables_workspaceId_projectId_key_key";
CREATE UNIQUE INDEX "environment_variables_workspaceId_projectId_environment_key_key"
  ON "environment_variables"("workspaceId", "projectId", "environment", "key");
CREATE INDEX "environment_variables_workspaceId_projectId_environment_idx"
  ON "environment_variables"("workspaceId", "projectId", "environment");
DROP INDEX "environment_variables_workspaceId_projectId_idx";

-- Deployment history and environment indexes.
CREATE INDEX "deployments_workspaceId_environment_createdAt_idx"
  ON "deployments"("workspaceId", "environment", "createdAt");

-- Composite uniqueness required for idempotency and tenant-safe rollback relations.
CREATE UNIQUE INDEX "deployments_workspaceId_projectId_environment_idempotencyKey_key"
  ON "deployments"("workspaceId", "projectId", "environment", "idempotencyKey");
CREATE UNIQUE INDEX "deployments_workspaceId_projectId_id_key"
  ON "deployments"("workspaceId", "projectId", "id");

-- Tenant-safe rollback relationship.
ALTER TABLE "deployments"
  ADD CONSTRAINT "deployments_workspaceId_projectId_rollbackOfId_fkey"
  FOREIGN KEY ("workspaceId", "projectId", "rollbackOfId")
  REFERENCES "deployments"("workspaceId", "projectId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Security history is retained when a workspace is removed.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_workspaceId_fkey";
ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- Remove the redundant standalone slug lookup index.
DROP INDEX "workspaces_slug_idx";
