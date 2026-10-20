import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  getInstructionsPath: vi.fn().mockReturnValue(undefined),
}));

import type { AihiveConfig } from "../config.js";
import { currentBranch, prepareWorkspaces } from "../worktrees.js";

// Uses real git repositories in a temp directory.

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

const config = {
  session: "test",
  agents: [
    { name: "Coordinator", role: "coordinator", window: "coordinator" },
    { name: "Reviewer", role: "reviewer", window: "reviewer" },
    { name: "Worker 1", role: "worker", window: "workers", pane: 0 },
    { name: "Worker 2", role: "worker", window: "workers", pane: 1 },
  ],
} as AihiveConfig;

describe("prepareWorkspaces", () => {
  let tmp: string;
  let project: string;
  let root: string;

  beforeEach(() => {
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "aihive-wt-")));
    project = path.join(tmp, "project");
    root = path.join(tmp, "worktrees");
    fs.mkdirSync(project);
    git(project, "init", "-q", "-b", "main");
    git(project, "config", "user.email", "t@example.com");
    git(project, "config", "user.name", "t");
    fs.writeFileSync(path.join(project, "a.txt"), "a\n");
    fs.mkdirSync(path.join(project, "node_modules"));
    git(project, "add", "a.txt");
    git(project, "commit", "-q", "-m", "init");
  });

  afterEach(() => {
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  it("gives each worker its own worktree and branch", () => {
    const plan = prepareWorkspaces(config, project, root);

    const w1 = plan.workspaces.get("Worker 1");
    expect(w1?.cwd).toBe(path.join(root, "worker-1"));
    expect(w1?.branch).toBe("aihive/worker-1");
    expect(w1?.addDirs).toEqual([project]);
    expect(currentBranch(path.join(root, "worker-1"))).toBe("aihive/worker-1");
    expect(currentBranch(path.join(root, "worker-2"))).toBe("aihive/worker-2");
    expect(plan.integrationBranch).toBe("main");

    // Non-workers stay in the project; the reviewer may read the worktrees
    expect(plan.workspaces.get("Coordinator")).toEqual({
      cwd: project,
      addDirs: [],
    });
    expect(plan.workspaces.get("Reviewer")?.addDirs).toEqual([root]);
  });

  it("writes a prompt naming the worktree, branch and integration branch", () => {
    const plan = prepareWorkspaces(config, project, root);
    const prompt = fs.readFileSync(
      plan.workspaces.get("Worker 1")?.promptFile ?? "",
      "utf8",
    );
    expect(prompt).toContain(path.join(root, "worker-1"));
    expect(prompt).toContain("`aihive/worker-1`");
    expect(prompt).toContain("git merge main");
    expect(prompt).toContain(`${project}/.aihive/`);
  });

  it("links node_modules without making it show up as untracked", () => {
    prepareWorkspaces(config, project, root);
    const wt = path.join(root, "worker-1");
    expect(fs.lstatSync(path.join(wt, "node_modules")).isSymbolicLink()).toBe(
      true,
    );
    expect(git(wt, "status", "--porcelain")).toBe("");
  });

  it("reuses an existing worktree and keeps uncommitted changes", () => {
    prepareWorkspaces(config, project, root);
    const file = path.join(root, "worker-1", "a.txt");
    fs.writeFileSync(file, "work in progress\n");

    const plan = prepareWorkspaces(config, project, root);

    expect(fs.readFileSync(file, "utf8")).toBe("work in progress\n");
    expect(plan.messages).toContain(
      "Worker 1: reusing worktree on aihive/worker-1",
    );
  });

  it("re-creates a worktree for an existing branch after its folder was removed", () => {
    prepareWorkspaces(config, project, root);
    const wt = path.join(root, "worker-1");
    fs.writeFileSync(path.join(wt, "b.txt"), "b\n");
    git(wt, "add", "b.txt");
    git(wt, "commit", "-q", "-m", "work");
    fs.rmSync(wt, { recursive: true, force: true });

    prepareWorkspaces(config, project, root);

    expect(fs.existsSync(path.join(wt, "b.txt"))).toBe(true);
  });

  it("keeps everyone in the project dir when disabled", () => {
    const plan = prepareWorkspaces(
      { ...config, worktrees: false },
      project,
      root,
    );
    expect(plan.workspaces.get("Worker 1")).toEqual({
      cwd: project,
      addDirs: [],
    });
    expect(fs.existsSync(root)).toBe(false);
  });

  it("keeps everyone in the project dir outside a git repository", () => {
    const plain = path.join(tmp, "plain");
    fs.mkdirSync(plain);
    const plan = prepareWorkspaces(config, plain, root);
    expect(plan.workspaces.get("Worker 1")).toEqual({
      cwd: plain,
      addDirs: [],
    });
    expect(plan.messages[0]).toMatch(/Worktrees disabled/);
  });

  it("falls back to the project dir when the folder is not a worktree", () => {
    fs.mkdirSync(path.join(root, "worker-1"), { recursive: true });
    const plan = prepareWorkspaces(config, project, root);
    expect(plan.workspaces.get("Worker 1")?.cwd).toBe(project);
    expect(plan.workspaces.get("Worker 2")?.cwd).toBe(
      path.join(root, "worker-2"),
    );
  });
});
