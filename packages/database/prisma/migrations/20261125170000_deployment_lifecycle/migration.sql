ALTER TYPE "DeploymentStatus" ADD VALUE 'PREPARING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'CLONING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'BUILDING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'DEPLOYING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'HEALTH_CHECKING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'CANCELLING';
ALTER TYPE "DeploymentStatus" ADD VALUE 'STOPPED';

ALTER TABLE "deployments"
  ADD COLUMN "previousDeploymentId" UUID,
  ADD COLUMN "requestedBranch" VARCHAR(255),
  ADD COLUMN "commitMessage" TEXT,
  ADD COLUMN "triggeredByUserId" UUID,
  ADD COLUMN "buildConfigurationSnapshot" JSONB,
  ADD COLUMN "queueJobId" VARCHAR(128),
  ADD COLUMN "failureMessage" TEXT;

CREATE UNIQUE INDEX "deployments_queueJobId_key"
  ON "deployments"("queueJobId");
CREATE INDEX "deployments_workspaceId_projectId_status_createdAt_idx"
  ON "deployments"("workspaceId", "projectId", "status", "createdAt");
CREATE INDEX "deployments_workspaceId_triggeredByUserId_createdAt_idx"
  ON "deployments"("workspaceId", "triggeredByUserId", "createdAt");

ALTER TABLE "deployments"
  ADD CONSTRAINT "deployments_workspaceId_projectId_previousDeploymentId_fkey"
  FOREIGN KEY ("workspaceId", "projectId", "previousDeploymentId")
  REFERENCES "deployments"("workspaceId", "projectId", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "deployments"
  ADD CONSTRAINT "deployments_triggeredByUserId_fkey"
  FOREIGN KEY ("triggeredByUserId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
