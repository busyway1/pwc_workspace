import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import {
  listScheduledJobs,
  resolveScheduledJob,
  deleteScheduledJob,
  type ScheduledJob,
} from "./scheduler.js";

// scheduler requires darwin or linux
const isSupported =
  process.platform === "darwin" || process.platform === "linux";

// Bun caches homedir() at process start, so we use the real home with unique slugs
const TEST_PREFIX = `_test_${Date.now()}_`;

describe.if(isSupported)("scheduler", () => {
  const home = homedir();
  const legacyJobsDir = join(home, ".config", "opencode", "jobs");
  const scopesDir = join(home, ".config", "opencode", "scheduler", "scopes");
  const createdFiles: string[] = [];
  const createdDirs: string[] = [];

  function createLegacyJob(slug: string, job: ScheduledJob) {
    mkdirSync(legacyJobsDir, { recursive: true });
    const path = join(legacyJobsDir, `${slug}.json`);
    writeFileSync(path, JSON.stringify(job));
    createdFiles.push(path);
  }

  function createScopedJob(scopeId: string, slug: string, job: ScheduledJob) {
    const dir = join(scopesDir, scopeId, "jobs");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${slug}.json`);
    writeFileSync(path, JSON.stringify(job));
    createdFiles.push(path);
    createdDirs.push(join(scopesDir, scopeId));
  }

  afterEach(() => {
    for (const f of createdFiles) {
      if (existsSync(f)) rmSync(f, { force: true });
    }
    for (const d of createdDirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
    createdFiles.length = 0;
    createdDirs.length = 0;
  });

  test("resolveScheduledJob throws for empty name", async () => {
    await expect(resolveScheduledJob("")).rejects.toThrow();
  });

  test("resolveScheduledJob throws for non-existent job", async () => {
    await expect(
      resolveScheduledJob(`${TEST_PREFIX}nonexistent`),
    ).rejects.toThrow();
  });

  test("listScheduledJobs finds legacy job files", async () => {
    const slug = `${TEST_PREFIX}daily`;
    const job: ScheduledJob = {
      slug,
      name: `${TEST_PREFIX}Daily Report`,
      schedule: "0 9 * * *",
      createdAt: new Date().toISOString(),
    };
    createLegacyJob(slug, job);

    const jobs = await listScheduledJobs();
    const found = jobs.find((j) => j.slug === slug);
    expect(found).toBeDefined();
    expect(found!.name).toBe(`${TEST_PREFIX}Daily Report`);
  });

  test("listScheduledJobs finds scoped job files", async () => {
    const scopeId = `${TEST_PREFIX}scope1`;
    const slug = `${TEST_PREFIX}scoped`;
    const job: ScheduledJob = {
      slug,
      name: `${TEST_PREFIX}Scoped Job`,
      schedule: "*/5 * * * *",
      createdAt: new Date().toISOString(),
    };
    createScopedJob(scopeId, slug, job);

    const jobs = await listScheduledJobs();
    const found = jobs.find((j) => j.slug === slug);
    expect(found).toBeDefined();
    expect(found!.scopeId).toBe(scopeId);
  });

  test("listScheduledJobs filters by workdir", async () => {
    const slug1 = `${TEST_PREFIX}wd1`;
    const slug2 = `${TEST_PREFIX}wd2`;
    const workdir = `/tmp/${TEST_PREFIX}project-a`;
    createLegacyJob(slug1, {
      slug: slug1,
      name: `${TEST_PREFIX}Job 1`,
      schedule: "* * * * *",
      createdAt: new Date().toISOString(),
      workdir,
    });
    createLegacyJob(slug2, {
      slug: slug2,
      name: `${TEST_PREFIX}Job 2`,
      schedule: "* * * * *",
      createdAt: new Date().toISOString(),
      workdir: `/tmp/${TEST_PREFIX}project-b`,
    });

    const jobs = await listScheduledJobs(workdir);
    const found = jobs.filter((j) => j.slug.startsWith(TEST_PREFIX));
    expect(found).toHaveLength(1);
    expect(found[0].slug).toBe(slug1);
  });

  test("resolveScheduledJob finds job by name", async () => {
    const slug = `${TEST_PREFIX}resolve-me`;
    const name = `${TEST_PREFIX}Resolve Me`;
    createLegacyJob(slug, {
      slug,
      name,
      schedule: "0 * * * *",
      createdAt: new Date().toISOString(),
    });

    const result = await resolveScheduledJob(name);
    expect(result.job.slug).toBe(slug);
    expect(result.systemPaths.length).toBeGreaterThan(0);
  });

  test("listScheduledJobs skips malformed job files", async () => {
    const slug = `${TEST_PREFIX}bad`;
    mkdirSync(legacyJobsDir, { recursive: true });
    const path = join(legacyJobsDir, `${slug}.json`);
    writeFileSync(path, "not json");
    createdFiles.push(path);

    const jobs = await listScheduledJobs();
    const found = jobs.find((j) => j.slug === slug);
    expect(found).toBeUndefined();
  });
});
