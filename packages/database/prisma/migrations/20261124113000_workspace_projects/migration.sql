ALTER TABLE "sessions" ADD COLUMN "activeWorkspaceId" UUID;
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_activeWorkspaceId_fkey" FOREIGN KEY ("activeWorkspaceId") REFERENCES "workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "projects" ADD COLUMN "description" VARCHAR(500);
