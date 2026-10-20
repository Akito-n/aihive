import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type CheckReport,
  CheckRunner,
  formatCheckReport,
  runChecks,
} from "../checks.js";

// Uses real child processes: `node -e` keeps the commands portable.
const node = (code: string) => `node -e ${JSON.stringify(code)}`;

describe("runChecks", () => {
  let dir: string;
  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-checks-"));
  });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  it("passes when every command exits 0, running them in the folder", async () => {
    const result = await runChecks(
      [node("require('fs').writeFileSync('ran.txt', 'ok')"), node("")],
      dir,
    );
    expect(result.passed).toBe(true);
    expect(result.runs.map((r) => r.exitCode)).toEqual([0, 0]);
    expect(fs.readFileSync(path.join(dir, "ran.txt"), "utf8")).toBe("ok");
  });

  it("stops at the first failure and keeps its output", async () => {
    const result = await runChecks(
      [
        node("console.log('fine')"),
        node("console.error('3 tests failed'); process.exit(2)"),
        node("require('fs').writeFileSync('never.txt', '')"),
      ],
      dir,
    );
    expect(result.passed).toBe(false);
    expect(result.runs).toHaveLength(2);
    expect(result.runs[1].exitCode).toBe(2);
    expect(result.failedCommand).toContain("3 tests failed");
    expect(result.outputTail).toContain("3 tests failed");
    expect(fs.existsSync(path.join(dir, "never.txt"))).toBe(false);
  });

  it("fails a command that runs past the timeout", async () => {
    const result = await runChecks(
      [node("setTimeout(() => {}, 10000)")],
      dir,
      300,
    );
    expect(result.passed).toBe(false);
    expect(result.runs[0]).toMatchObject({ timedOut: true, exitCode: null });
  });
});

describe("formatCheckReport", () => {
  it("lists the task, commit and runs, with output only on failure", () => {
    const failed = formatCheckReport(
      {
        passed: false,
        failedCommand: "npm test",
        outputTail: "FAIL a.test.ts\n1 failed",
        runs: [
          {
            command: "npm run typecheck",
            exitCode: 0,
            timedOut: false,
            durationMs: 4000,
          },
          {
            command: "npm test",
            exitCode: 1,
            timedOut: false,
            durationMs: 9000,
          },
        ],
      },
      {
        taskId: "T1-2",
        worker: "Worker 1",
        cwd: "/wt/worker-1",
        commit: "abc1234",
      },
    );
    expect(failed).toContain("task_id: T1-2");
    expect(failed).toContain("commit: abc1234");
    expect(failed).toContain("passed: false");
    expect(failed).toContain("failed_command: npm test");
    expect(failed).toContain("  - npm test → exit 1 (9s)");
    expect(failed).toContain("output: |\n  FAIL a.test.ts\n  1 failed");

    const passed = formatCheckReport(
      { passed: true, outputTail: "all good", runs: [] },
      { worker: "Worker 1", cwd: "/proj" },
    );
    expect(passed).toContain("passed: true");
    expect(passed).not.toContain("output:");
    expect(passed).not.toContain("task_id");
  });
});

describe("CheckRunner", () => {
  it("runs in the project folder when the worker has no worktree and reports once", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-runner-"));
    try {
      const done = vi.fn<(r: CheckReport) => void>();
      const runner = new CheckRunner([node("")], dir, done);
      expect(runner.folderFor("Worker 1")).toBe(dir);

      await runner.run("Worker 1", "T1");
      expect(done).toHaveBeenCalledOnce();
      expect(done.mock.calls[0][0]).toMatchObject({
        worker: "Worker 1",
        taskId: "T1",
        result: { passed: true },
      });
      expect(done.mock.calls[0][0].payload).toContain(`folder: ${dir}`);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("runs reports for the same folder one after another", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-runner-"));
    try {
      // Each run appends start/end markers; overlapping runs would interleave them
      const log = path.join(dir, "log.txt");
      const cmd = node(
        `const fs=require('fs');fs.appendFileSync(${JSON.stringify(log)},'s');setTimeout(()=>fs.appendFileSync(${JSON.stringify(log)},'e'),150)`,
      );
      const runner = new CheckRunner([cmd], dir, () => {});
      await Promise.all([runner.run("Worker 1"), runner.run("Worker 1")]);
      expect(fs.readFileSync(log, "utf8")).toBe("sese");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
