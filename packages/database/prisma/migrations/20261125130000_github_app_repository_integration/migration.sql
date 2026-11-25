CREATE TYPE "GitHubInstallationStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'REMOVED');
CREATE TYPE "GitHubRepositorySelection" AS ENUM ('ALL', 'SELECTED');
CREATE TYPE "GitHubAppStatePurpose" AS ENUM ('INSTALL_CALLBACK', 'INSTALL_AUTHORIZATION');

CREATE UNIQUE INDEX "sessions_id_userId_key" ON "sessions"("id", "userId");

CREATE TABLE "github_installations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "workspaceId" UUID NOT NULL,
  "installationId" BIGINT NOT NULL,
  "githubAccountId" BIGINT NOT NULL,
  "accountLogin" TEXT NOT NULL,
  "accountType" TEXT NOT NULL,
  "repositorySelection" "GitHubRepositorySelection" NOT NULL,
  "status" "GitHubInstallationStatus" NOT NULL DEFAULT 'ACTIVE',
  "authorizedGithubUserId" TEXT NOT NULL,
  "authorizedUserId" UUID NOT NULL,
  "installedByUserId" UUID NOT NULL,
  "suspendedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "github_installations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "github_app_states" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "stateHash" TEXT NOT NULL,
  "userId" UUID NOT NULL,
  "sessionId" UUID NOT NULL,
  "workspaceId" UUID NOT NULL,
  "purpose" "GitHubAppStatePurpose" NOT NULL,
  "installationId" BIGINT,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "github_app_states_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "repositories"
  ADD COLUMN "installationId" UUID,
  ADD COLUMN "installationWorkspaceId" UUID,
  ADD COLUMN "fullName" TEXT,
  ADD COLUMN "defaultBranch" TEXT,
  ADD COLUMN "selectedBranch" TEXT,
  ADD COLUMN "language" TEXT,
  ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "repositories"
  ADD CONSTRAINT "repositories_installation_workspace_check"
  CHECK ("installationWorkspaceId" IS NULL OR "installationWorkspaceId" = "workspaceId");

CREATE UNIQUE INDEX "github_installations_installationId_key" ON "github_installations"("installationId");
CREATE UNIQUE INDEX "github_installations_workspaceId_id_key" ON "github_installations"("workspaceId", "id");
CREATE INDEX "github_installations_workspaceId_status_createdAt_idx" ON "github_installations"("workspaceId", "status", "createdAt");
CREATE INDEX "github_installations_githubAccountId_idx" ON "github_installations"("githubAccountId");

CREATE UNIQUE INDEX "github_app_states_stateHash_key" ON "github_app_states"("stateHash");
CREATE INDEX "github_app_states_userId_purpose_expiresAt_idx" ON "github_app_states"("userId", "purpose", "expiresAt");
CREATE INDEX "github_app_states_sessionId_expiresAt_idx" ON "github_app_states"("sessionId", "expiresAt");

CREATE INDEX "repositories_installationWorkspaceId_installationId_idx" ON "repositories"("installationWorkspaceId", "installationId");

ALTER TABLE "github_installations"
  ADD CONSTRAINT "github_installations_workspaceId_fkey"
  FOREIGN KEY ("workspaceId") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "github_installations_authorizedUserId_fkey"
  FOREIGN KEY ("authorizedUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "github_installations_installedByUserId_fkey"
  FOREIGN KEY ("installedByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "github_app_states"
  ADD CONSTRAINT "github_app_states_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "github_app_states_sessionId_userId_fkey"
  FOREIGN KEY ("sessionId", "userId") REFERENCES "sessions"("id", "userId") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "github_app_states_workspaceId_userId_fkey"
  FOREIGN KEY ("workspaceId", "userId") REFERENCES "workspace_members"("workspaceId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "repositories"
  ADD CONSTRAINT "repositories_installationWorkspaceId_installationId_fkey"
  FOREIGN KEY ("installationWorkspaceId", "installationId") REFERENCES "github_installations"("workspaceId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
