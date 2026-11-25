import assert from "node:assert/strict";
import test from "node:test";
import {
  branchNameSchema,
  buildConfigurationSchema,
  commitShaSchema,
  repositoryPathSchema,
} from "../src/validators/project-intelligence.validator.ts";

test("branch validation accepts exact case and rejects unsafe Git refs", () => {
  assert.equal(branchNameSchema.safeParse("Feature/KeepCase").success, true);
  assert.equal(branchNameSchema.safeParse("../../main").success, false);
  assert.equal(branchNameSchema.safeParse("main?format=raw").success, false);
});

test("repository paths reject traversal and absolute paths", () => {
  assert.equal(repositoryPathSchema.safeParse("apps/web/app.tsx").success, true);
  assert.equal(repositoryPathSchema.safeParse("../.env").success, false);
  assert.equal(repositoryPathSchema.safeParse("/etc/passwd").success, false);
  assert.equal(repositoryPathSchema.safeParse("apps\\web").success, false);
});

test("commit SHA validation accepts Git hashes only", () => {
  assert.equal(commitShaSchema.safeParse("a1b2c3d").success, true);
  assert.equal(commitShaSchema.safeParse("not-a-sha").success, false);
  assert.equal(commitShaSchema.safeParse("a".repeat(41)).success, false);
});

test("build configuration validates paths, limits, and maximum PostgreSQL integer port", () => {
  const valid = buildConfigurationSchema.safeParse({ applicationPort: 65535, rootDirectory: "apps/web", packageManager: "pnpm", buildTimeoutSeconds: 3600 });
  assert.equal(valid.success, true);
  assert.equal(buildConfigurationSchema.safeParse({ applicationPort: 65536 }).success, false);
  assert.equal(buildConfigurationSchema.safeParse({ dockerfilePath: "../../Dockerfile" }).success, false);
  assert.equal(buildConfigurationSchema.safeParse({ rootDirectory: "C:outside" }).success, false);
  assert.equal(buildConfigurationSchema.safeParse({ extra: "ignored?" }).success, false);
});
