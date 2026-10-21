// ─── Skill usage ──────────────────────────────────────────────────
// Counts the skills agents called, read from Claude Code's conversation
// history (~/.claude/projects/<dir>/*.jsonl), for the game's special moves.
// Read only: nothing is written to the history or told to the agents.

import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

export interface SkillUse {
  /** The tool call's id, so a use is counted once */
  id: string;
  skill: string;
}

export const CLAUDE_PROJECTS_DIR = path.join(homedir(), ".claude", "projects");

/** Claude Code names a project's history directory after its path */
export function historyDirName(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

/** Skill names as they may appear: plugin:skill, kebab-case and so on */
const SKILL_NAME = /^[\w.:-]{1,64}$/;
const TOOL_USE_ID = /^[\w-]{1,128}$/;

/** Skill tool calls in one line of history, if it is an assistant message */
export function skillUsesInLine(line: string): SkillUse[] {
  let entry: unknown;
  try {
    entry = JSON.parse(line);
  } catch {
    return [];
  }
  const message = (entry as { message?: { role?: unknown; content?: unknown } })
    ?.message;
  if (message?.role !== "assistant" || !Array.isArray(message.content)) {
    return [];
  }
  const uses: SkillUse[] = [];
  for (const block of message.content) {
    const b = block as {
      type?: unknown;
      id?: unknown;
      name?: unknown;
      input?: { skill?: unknown };
    };
    if (
      b?.type === "tool_use" &&
      b.name === "Skill" &&
      typeof b.id === "string" &&
      TOOL_USE_ID.test(b.id) &&
      typeof b.input?.skill === "string" &&
      SKILL_NAME.test(b.input.skill)
    ) {
      uses.push({ id: b.id, skill: b.input.skill });
    }
  }
  return uses;
}

/**
 * Skill uses in the history of these working directories, from files
 * changed since `since`. Missing or unreadable files are skipped.
 */
export function findSkillUses(
  cwds: string[],
  since: number,
  root = CLAUDE_PROJECTS_DIR,
): SkillUse[] {
  const uses: SkillUse[] = [];
  for (const cwd of new Set(cwds)) {
    const dir = path.join(root, historyDirName(cwd));
    let files: string[];
    try {
      files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"));
    } catch {
      continue;
    }
    for (const file of files) {
      const filePath = path.join(dir, file);
      try {
        if (fs.statSync(filePath).mtimeMs < since) continue;
        for (const line of fs.readFileSync(filePath, "utf8").split("\n")) {
          if (line.includes('"Skill"')) uses.push(...skillUsesInLine(line));
        }
      } catch {
        // skip unreadable files
      }
    }
  }
  return uses;
}
