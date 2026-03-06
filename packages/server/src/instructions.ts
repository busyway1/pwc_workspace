import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { exists } from "./utils.js";
import { ApiError } from "./errors.js";
import { opencodeConfigPath } from "./workspace-files.js";
import { readJsoncFile, updateJsoncTopLevel } from "./jsonc.js";

const INSTRUCTIONS_FILE = "instructions.md";
const INSTRUCTIONS_DIR = ".opencode";

export interface InstructionsResult {
  content: string;
  path: string;
  lastModified: string | null;
}

export async function getInstructions(
  workspaceRoot: string,
): Promise<InstructionsResult> {
  const filePath = join(workspaceRoot, INSTRUCTIONS_DIR, INSTRUCTIONS_FILE);
  if (!(await exists(filePath))) {
    return { content: "", path: filePath, lastModified: null };
  }
  const content = await readFile(filePath, "utf8");
  const fileStat = await stat(filePath);
  return {
    content,
    path: filePath,
    lastModified: fileStat.mtime.toISOString(),
  };
}

export async function saveInstructions(
  workspaceRoot: string,
  content: string,
): Promise<{ path: string; action: "created" | "updated" }> {
  if (typeof content !== "string") {
    throw new ApiError(
      400,
      "invalid_content",
      "Instructions content must be a string",
    );
  }
  const dir = join(workspaceRoot, INSTRUCTIONS_DIR);
  await mkdir(dir, { recursive: true });
  const filePath = join(dir, INSTRUCTIONS_FILE);
  const existed = await exists(filePath);
  const normalized = content.endsWith("\n") ? content : content + "\n";
  await writeFile(filePath, normalized, "utf8");
  return { path: filePath, action: existed ? "updated" : "created" };
}

/**
 * Ensures `.opencode/instructions.md` is referenced in the opencode config
 * `instructions` field so the engine picks it up as system prompt.
 */
export async function ensureInstructionsInConfig(
  workspaceRoot: string,
): Promise<void> {
  const configPath = opencodeConfigPath(workspaceRoot);
  const entry = ".opencode/instructions.md";

  const { data } = await readJsoncFile<Record<string, unknown>>(configPath, {});
  const current = data.instructions;

  let next: string[];
  if (typeof current === "string") {
    if (current === entry) return;
    next = [current, entry];
  } else if (Array.isArray(current)) {
    if (current.includes(entry)) return;
    next = [...current, entry];
  } else {
    next = [entry];
  }

  await updateJsoncTopLevel(configPath, { instructions: next });
}
