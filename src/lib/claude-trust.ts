// ─── Claude Folder Trust ─────────────────────────────────────────────
// Claude Code asks "Do you trust this folder?" the first time it runs in
// a folder, so a fresh start asks once in every agent's window (and in
// every worker's worktree). aihive asks the user once instead and records
// the answer in Claude's own config, the same place the dialog saves it.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AihiveConfig } from "./config.js";
import type { AgentWorkspace } from "./worktrees.js";

/** Claude Code's global config file, which holds the per-folder trust */
export function claudeConfigPath(
  env: NodeJS.ProcessEnv = process.env,
  home = os.homedir(),
): string {
  const dir = env.CLAUDE_CONFIG_DIR;
  return dir ? path.join(dir, ".claude.json") : path.join(home, ".claude.json");
}

/** A folder as Claude records it: the real path of its working directory */
function canonical(dir: string): string {
  try {
    return fs.realpathSync(dir);
  } catch {
    return path.resolve(dir);
  }
}

type ClaudeConfig = {
  projects?: Record<string, { hasTrustDialogAccepted?: boolean }>;
};

function readConfig(file: string): ClaudeConfig {
  if (!fs.existsSync(file)) return {};
  // A file we cannot parse is never rewritten, so nothing in it is lost
  const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error(`${file} is not a JSON object`);
  }
  return parsed as ClaudeConfig;
}

/** The working folders of the agents that run Claude Code, without repeats */
export function claudeAgentDirs(
  config: AihiveConfig,
  workspaces: Map<string, AgentWorkspace>,
  projectDir: string,
): string[] {
  const dirs = config.agents
    .filter((a) => (a.cli ?? "claude") === "claude")
    .map((a) => canonical(workspaces.get(a.name)?.cwd ?? projectDir));
  return [...new Set(dirs)];
}

/** The folders Claude has not been told to trust yet */
export function untrustedDirs(
  dirs: string[],
  file = claudeConfigPath(),
): string[] {
  let projects: ClaudeConfig["projects"];
  try {
    projects = readConfig(file).projects;
  } catch {
    // Unreadable: let Claude ask in each window, as it would without aihive
    return [];
  }
  return dirs.filter(
    (dir) => projects?.[canonical(dir)]?.hasTrustDialogAccepted !== true,
  );
}

/**
 * Record the folders as trusted, as answering "Yes, I trust this folder"
 * would. Every other setting in the file is kept, and the file is replaced
 * in one step so Claude never reads it half written.
 */
export function trustDirs(dirs: string[], file = claudeConfigPath()): void {
  if (dirs.length === 0) return;
  const config = readConfig(file);
  const projects = { ...(config.projects ?? {}) };
  for (const dir of dirs) {
    const key = canonical(dir);
    projects[key] = { ...(projects[key] ?? {}), hasTrustDialogAccepted: true };
  }
  const next = { ...config, projects };
  const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o600;
  const tmp = `${file}.aihive-${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode });
  fs.renameSync(tmp, file);
}
