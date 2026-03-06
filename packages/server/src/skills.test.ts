import { describe, expect, test, beforeEach, afterEach } from "bun:test";
import { join } from "node:path";
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { listSkills, upsertSkill, deleteSkill } from "./skills.js";

describe("skills", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "skills-"));
    // Create a .git directory so findWorkspaceRoots stops here
    mkdirSync(join(tmpDir, ".git"), { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("listSkills returns empty when no skills exist", async () => {
    const result = await listSkills(tmpDir, false);
    expect(result).toEqual([]);
  });

  test("upsertSkill creates a new skill", async () => {
    const result = await upsertSkill(tmpDir, {
      name: "test-skill",
      content: "This is the skill content",
      description: "A test skill",
    });
    expect(result.action).toBe("added");
    expect(result.path).toContain("test-skill");
  });

  test("upsertSkill updates an existing skill", async () => {
    await upsertSkill(tmpDir, {
      name: "my-skill",
      content: "v1 content",
      description: "first version",
    });
    const result = await upsertSkill(tmpDir, {
      name: "my-skill",
      content: "v2 content",
      description: "second version",
    });
    expect(result.action).toBe("updated");
  });

  test("listSkills finds created skills", async () => {
    await upsertSkill(tmpDir, {
      name: "hello-world",
      content: "Hello!",
      description: "A hello skill",
    });

    const skills = await listSkills(tmpDir, false);
    expect(skills).toHaveLength(1);
    expect(skills[0].name).toBe("hello-world");
    expect(skills[0].scope).toBe("project");
  });

  test("deleteSkill removes the skill", async () => {
    await upsertSkill(tmpDir, {
      name: "to-delete",
      content: "temp",
      description: "will be deleted",
    });
    await deleteSkill(tmpDir, "to-delete");

    const skills = await listSkills(tmpDir, false);
    expect(skills).toEqual([]);
  });

  test("deleteSkill throws for non-existent skill", async () => {
    await expect(deleteSkill(tmpDir, "nonexistent")).rejects.toThrow();
  });

  test("upsertSkill throws for empty content", async () => {
    await expect(
      upsertSkill(tmpDir, { name: "bad", content: "" }),
    ).rejects.toThrow();
  });

  test("upsertSkill throws for invalid name", async () => {
    await expect(
      upsertSkill(tmpDir, { name: "INVALID NAME!", content: "x", description: "d" }),
    ).rejects.toThrow();
  });

  test("listSkills deduplicates by name", async () => {
    // Create the same skill in two locations
    const opencodeDir = join(tmpDir, ".opencode", "skills", "dup-skill");
    const claudeDir = join(tmpDir, ".claude", "skills", "dup-skill");
    mkdirSync(opencodeDir, { recursive: true });
    mkdirSync(claudeDir, { recursive: true });
    const skillContent = "---\nname: dup-skill\ndescription: test\n---\nContent\n";
    writeFileSync(join(opencodeDir, "SKILL.md"), skillContent);
    writeFileSync(join(claudeDir, "SKILL.md"), skillContent);

    const skills = await listSkills(tmpDir, false);
    const dupSkills = skills.filter((s) => s.name === "dup-skill");
    expect(dupSkills).toHaveLength(1);
  });

  test("upsertSkill with frontmatter preserves metadata", async () => {
    const content = "---\nname: fm-skill\ndescription: From frontmatter\n---\nBody here";
    const result = await upsertSkill(tmpDir, {
      name: "fm-skill",
      content,
    });
    expect(result.action).toBe("added");

    const skills = await listSkills(tmpDir, false);
    const found = skills.find((s) => s.name === "fm-skill");
    expect(found).toBeDefined();
    expect(found!.description).toBe("From frontmatter");
  });

  test("upsertSkill rejects mismatched frontmatter name", async () => {
    const content = "---\nname: wrong-name\ndescription: test\n---\nBody";
    await expect(
      upsertSkill(tmpDir, { name: "correct-name", content }),
    ).rejects.toThrow();
  });
});
