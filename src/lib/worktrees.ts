import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { AihiveConfig } from "./config.js";
import { getInstructionsPath } from "./config.js";
import { tf } from "./i18n.js";
import { toSlug } from "./mailbox.js";

// ─── Types ───────────────────────────────────────────────────────────

/** Where an agent runs and what extra context its CLI needs */
export interface AgentWorkspace {
  cwd: string; // pane working directory
  addDirs: string[]; // extra directories the CLI may read/write
  promptFile?: string; // replaces the role instructions file when set
  branch?: string; // the agent's own git branch (workers only)
}

export interface WorkspacePlan {
  workspaces: Map<string, AgentWorkspace>; // agent name → workspace
  integrationBranch?: string; // branch checked out in the project dir
  messages: string[]; // human-readable notes for the TUI log
}

/** Roles that get their own git worktree */
const WORKTREE_ROLES = new Set(["worker"]);

// ─── Planning ────────────────────────────────────────────────────────

/**
 * Give each worker its own git worktree and branch so parallel edits never
 * overwrite each other. Other agents run in the project directory.
 * Falls back to the project directory for everyone when the project is not
 * a git repository or worktrees are disabled in the config.
 */
export function prepareWorkspaces(
  config: AihiveConfig,
  projectDir: string,
  rootDir = defaultWorktreeRoot(projectDir),
): WorkspacePlan {
  const plan: WorkspacePlan = { workspaces: new Map(), messages: [] };
  for (const agent of config.agents) {
    plan.workspaces.set(agent.name, { cwd: projectDir, addDirs: [] });
  }

  const workers = config.agents.filter((a) => WORKTREE_ROLES.has(a.role));
  if (config.worktrees === false || workers.length === 0) return plan;

  const integrationBranch = currentBranch(projectDir);
  if (!integrationBranch) {
    plan.messages.push(
      "Worktrees disabled: not a git repository or HEAD is detached",
    );
    return plan;
  }
  plan.integrationBranch = integrationBranch;

  fs.mkdirSync(path.join(rootDir, "prompts"), { recursive: true });
  git(projectDir, ["worktree", "prune"]);

  for (const agent of workers) {
    const slug = toSlug(agent.name);
    const branch = `aihive/${slug}`;
    const dir = path.join(rootDir, slug);
    try {
      const created = ensureWorktree(projectDir, dir, branch);
      linkNodeModules(projectDir, dir);
      const promptFile = path.join(rootDir, "prompts", `${slug}.md`);
      fs.writeFileSync(
        promptFile,
        renderWorkspacePrompt(agent.role, {
          projectDir,
          worktreeDir: dir,
          branch,
          integrationBranch,
        }),
      );
      plan.workspaces.set(agent.name, {
        cwd: dir,
        addDirs: [projectDir],
        promptFile,
        branch,
      });
      plan.messages.push(
        `${agent.name}: ${created ? "created" : "reusing"} worktree on ${branch}`,
      );
    } catch (e) {
      plan.messages.push(
        `${agent.name}: worktree unavailable, using project dir (${errorText(e)})`,
      );
    }
  }

  // Reviewers check worker branches inside their worktrees
  for (const agent of config.agents) {
    if (agent.role !== "reviewer") continue;
    const ws = plan.workspaces.get(agent.name);
    if (ws) ws.addDirs.push(rootDir);
  }

  return plan;
}

/** ~/.aihive/worktrees/<project>-<hash>, outside the repository */
export function defaultWorktreeRoot(projectDir: string): string {
  const hash = createHash("sha256").update(projectDir).digest("hex");
  return path.join(
    homedir(),
    ".aihive",
    "worktrees",
    `${path.basename(projectDir)}-${hash.slice(0, 8)}`,
  );
}

// ─── Prompt ──────────────────────────────────────────────────────────

/** Role instructions followed by where this worker works and how to commit */
export function renderWorkspacePrompt(
  role: string,
  ctx: {
    projectDir: string;
    worktreeDir: string;
    branch: string;
    integrationBranch: string;
  },
): string {
  const instructionsPath = getInstructionsPath(role);
  const instructions = instructionsPath
    ? fs.readFileSync(instructionsPath, "utf8")
    : "";
  const section = `\n\n---\n\n${tf("worktree.prompt", ctx)}\n`;
  return instructions + section;
}

// ─── Git helpers ─────────────────────────────────────────────────────

function git(cwd: string, args: string[]): string {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/** Current branch name, or undefined outside a repo or on a detached HEAD */
export function currentBranch(projectDir: string): string | undefined {
  try {
    const branch = git(projectDir, [
      "symbolic-ref",
      "--quiet",
      "--short",
      "HEAD",
    ]);
    return branch || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Make sure `dir` is a worktree of `projectDir` on `branch`.
 * An existing worktree is reused untouched so uncommitted work survives.
 * Returns true when a new worktree was created.
 */
function ensureWorktree(
  projectDir: string,
  dir: string,
  branch: string,
): boolean {
  if (fs.existsSync(dir)) {
    const top = git(dir, ["rev-parse", "--show-toplevel"]);
    if (path.resolve(top) !== path.resolve(dir)) {
      throw new Error(`${dir} exists but is not a worktree`);
    }
    return false;
  }
  const branchExists = (() => {
    try {
      git(projectDir, [
        "rev-parse",
        "--verify",
        "--quiet",
        `refs/heads/${branch}`,
      ]);
      return true;
    } catch {
      return false;
    }
  })();
  git(
    projectDir,
    branchExists
      ? ["worktree", "add", dir, branch]
      : ["worktree", "add", "-b", branch, dir, "HEAD"],
  );
  return true;
}

/** Share the project's node_modules so each worker can run checks at once */
function linkNodeModules(projectDir: string, dir: string): void {
  const source = path.join(projectDir, "node_modules");
  const target = path.join(dir, "node_modules");
  if (!fs.existsSync(source) || fs.existsSync(target)) return;
  fs.symlinkSync(source, target, "dir");

  // A symlink does not match the usual `node_modules/` ignore pattern
  const exclude = git(dir, ["rev-parse", "--git-path", "info/exclude"]);
  const excludePath = path.resolve(dir, exclude);
  const current = fs.existsSync(excludePath)
    ? fs.readFileSync(excludePath, "utf8")
    : "";
  if (!current.split("\n").includes("/node_modules")) {
    fs.mkdirSync(path.dirname(excludePath), { recursive: true });
    fs.appendFileSync(
      excludePath,
      `${current && !current.endsWith("\n") ? "\n" : ""}/node_modules\n`,
    );
  }
}

function errorText(e: unknown): string {
  const err = e as { stderr?: string; message?: string };
  return (err.stderr || err.message || String(e))
    .toString()
    .trim()
    .split("\n")[0];
}
