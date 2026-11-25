ALTER TABLE "repositories"
  ADD COLUMN "description" VARCHAR(500),
  ADD COLUMN "githubOwnerLogin" TEXT,
  ADD COLUMN "githubOwnerType" TEXT,
  ADD COLUMN "stars" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "forks" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "openIssuesCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "sizeKb" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastPushedAt" TIMESTAMP(3),
  ADD COLUMN "githubUpdatedAt" TIMESTAMP(3),
  ADD COLUMN "isArchived" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "lastSyncedAt" TIMESTAMP(3);

CREATE TABLE "project_build_configurations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "framework" VARCHAR(80),
  "runtime" VARCHAR(80),
  "rootDirectory" VARCHAR(500),
  "installCommand" TEXT,
  "buildCommand" TEXT,
  "startCommand" TEXT,
  "dockerfilePath" VARCHAR(500),
  "applicationPort" INTEGER,
  "buildTimeoutSeconds" INTEGER,
  "environment" "DeploymentEnvironment",
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "project_build_configurations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "project_build_configurations_workspaceId_projectId_key"
  ON "project_build_configurations"("workspaceId", "projectId");
CREATE INDEX "project_build_configurations_workspaceId_updatedAt_idx"
  ON "project_build_configurations"("workspaceId", "updatedAt");

ALTER TABLE "project_build_configurations"
  ADD CONSTRAINT "project_build_configurations_workspaceId_projectId_fkey"
  FOREIGN KEY ("workspaceId", "projectId")
  REFERENCES "projects"("workspaceId", "id")
  ON DELETE CASCADE ON UPDATE CASCADE;
