import assert from "node:assert/strict";
import { prisma } from "../../../packages/database/dist/index.js";
import { env } from "../dist/config/env.js";
import { verifyAppInstallation, listInstallationRepositories } from "../dist/services/github-app.service.js";
import {
  getRepositoryMetadata, getCommitHistory, getLatestCommit, getCommitDetails,
  listRepositoryBranches, listRepositoryTags, browseRepositoryFiles,
  getRepositoryLanguages, detectRepositoryFramework,
} from "../dist/services/repository-intelligence.service.js";
import { redisProducerConnection } from "../dist/services/queue-producer.js";

let passed = false;
try {
  const linked = await prisma.repository.findFirst({
    where: { provider: "GITHUB" },
    select: {
      workspaceId: true, projectId: true, externalId: true, fullName: true,
      selectedBranch: true, defaultBranch: true,
      installation: { select: { installationId: true } },
    },
  });
  assert(linked?.fullName && linked.installation, "Expected an imported GitHub repository linked to an installation");
  const [owner, repo] = linked.fullName.split("/");
  assert(owner && repo, "Expected repository owner/name");
  const base = {
    workspaceId: linked.workspaceId, projectId: linked.projectId, externalId: linked.externalId,
    installationId: linked.installation.installationId, owner, repo,
  };
  const appIdentity = await verifyAppInstallation(base.installationId);
  assert.equal(appIdentity.appId, Number(env.GITHUB_APP_ID), "Installation must belong to the configured GitHub App");
  const accessible = await listInstallationRepositories(base.installationId);
  assert(accessible.some(({ id }) => String(id) === linked.externalId), "Imported repository must remain accessible to the installation");

  const metadata = await getRepositoryMetadata(base.installationId, owner, repo);
  assert.equal(String(metadata.id), linked.externalId);
  const branch = linked.selectedBranch ?? linked.defaultBranch ?? metadata.defaultBranch;
  assert(branch, "Repository must expose a selected/default branch");
  const [history, latest, branches, tags, files, languages, detection] = await Promise.all([
    getCommitHistory({ ...base, branch, page: 1, perPage: 5 }),
    getLatestCommit({ ...base, branch }),
    listRepositoryBranches({ ...base, defaultBranch: metadata.defaultBranch, page: 1, perPage: 100, search: "" }),
    listRepositoryTags({ ...base, page: 1, perPage: 10 }),
    browseRepositoryFiles({ ...base, branch, path: "" }),
    getRepositoryLanguages(base),
    detectRepositoryFramework({ ...base, branch }),
  ]);
  assert(branches.items.some((item) => item.name === branch), "Selected branch must be returned by GitHub");
  const detail = latest ? await getCommitDetails({ ...base, branch, sha: latest.sha }) : null;
  const projectCount = await prisma.project.count({ where: { id: linked.projectId, workspaceId: linked.workspaceId } });
  const repositoryCount = await prisma.repository.count({ where: { externalId: linked.externalId, workspaceId: linked.workspaceId } });
  assert.equal(projectCount, 1);
  assert.equal(repositoryCount, 1);
  console.log(JSON.stringify({
    repository: metadata.fullName,
    installationAppVerified: true,
    repositoryAccessVerified: true,
    branch,
    visibility: metadata.visibility,
    language: metadata.language,
    counts: { commits: history.items.length, branches: branches.items.length, tags: tags.items.length, rootEntries: files.entries.length, languages: languages.languages.length },
    latestCommit: latest ? { sha: latest.sha, message: latest.message, author: latest.authorName, detailFiles: detail?.files.length ?? 0 } : null,
    detection: { frameworks: detection.frameworks.map(({ name }) => name), runtime: detection.runtime, packageManager: detection.packageManager, monorepo: detection.monorepo },
    persistedProjectAndRepository: true,
  }, null, 2));
  passed = true;
} finally {
  await prisma.$disconnect();
  redisProducerConnection.disconnect();
  if (passed) process.exit(0);
}
