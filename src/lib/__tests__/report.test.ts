import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { setLocale } from "../i18n.js";
import {
  CompletionReporter,
  formatDuration,
  formatReport,
  REPORT_SETTLE_MS,
  writeReport,
} from "../report.js";
import type { Task, TaskState } from "../tasks.js";

const T0 = Date.parse("2026-10-20T10:00:00Z");

function task(
  id: string,
  state: TaskState,
  minutes: { created?: number; updated?: number } = {},
  extra: Partial<Task> = {},
): Task {
  return {
    id,
    description: `Do ${id}`,
    assignedTo: "Worker 1",
    state,
    blockedBy: [],
    createdAt: new Date(T0 + (minutes.created ?? 0) * 60_000).toISOString(),
    updatedAt: new Date(T0 + (minutes.updated ?? 0) * 60_000).toISOString(),
    ...extra,
  };
}

afterEach(() => setLocale("ja"));

describe("CompletionReporter", () => {
  const settled = T0 + REPORT_SETTLE_MS;

  it("reports once every task is finished and has settled", () => {
    const r = new CompletionReporter();
    const tasks = [task("T1", "done"), task("T2", "error")];
    expect(r.due(tasks, settled - 1)).toBe(false);
    expect(r.due(tasks, settled)).toBe(true);
    // The same finished set is reported only once
    expect(r.due(tasks, settled + 60_000)).toBe(false);
  });

  it("does not report while a task is still open, or with no tasks", () => {
    const r = new CompletionReporter();
    expect(r.due([], settled)).toBe(false);
    expect(r.due([task("T1", "done"), task("T2", "review")], settled)).toBe(
      false,
    );
  });

  it("reports again after a task is reopened and finished again", () => {
    const r = new CompletionReporter();
    expect(r.due([task("T1", "done")], settled)).toBe(true);
    const again = [task("T1", "done", { updated: 10 })];
    expect(r.due(again, settled + 10 * 60_000)).toBe(true);
  });

  it("skips tasks that were already finished when primed", () => {
    const r = new CompletionReporter();
    const tasks = [task("T1", "done")];
    r.prime(tasks);
    expect(r.due(tasks, settled)).toBe(false);
    // Priming with open tasks does not hold back a later report
    const r2 = new CompletionReporter();
    r2.prime([task("T1", "running")]);
    expect(r2.due(tasks, settled)).toBe(true);
  });
});

describe("formatDuration", () => {
  it("rounds down to minutes and shows hours", () => {
    setLocale("en");
    expect(formatDuration(30_000)).toBe("<1 min");
    expect(formatDuration(12 * 60_000 + 59_000)).toBe("12 min");
    expect(formatDuration(65 * 60_000)).toBe("1 h 5 min");
    setLocale("ja");
    expect(formatDuration(65 * 60_000)).toBe("1時間5分");
  });
});

describe("formatReport", () => {
  it("lists every task with its state, time, checks and result", () => {
    setLocale("en");
    const tasks = [
      task(
        "T2",
        "error",
        { created: 5, updated: 20 },
        { assignedTo: "Reviewer", result: "Review: FAIL\nTests broke" },
      ),
      task("T1", "done", { updated: 65 }, { result: "done" }),
    ];
    const checks = new Map([
      ["T1", { passed: true, commit: "abc1234" }],
      ["T2", { passed: false, failedCommand: "npm test" }],
    ]);
    const md = formatReport(tasks, checks, new Date(T0 + 70 * 60_000));
    expect(md).toContain("# aihive completion report");
    expect(md).toContain("- Tasks: 2 (1 done / 1 failed)");
    expect(md).toContain("- Total time: 1 h 5 min");
    // Oldest task first
    expect(md.indexOf("## T1: Do T1")).toBeLessThan(md.indexOf("## T2"));
    expect(md).toContain("- Checks: passed (commit abc1234)");
    expect(md).toContain("- Checks: failed (npm test)");
    expect(md).toContain("- Last assignee: Reviewer");
    expect(md).toContain("- Time taken: 15 min");
    expect(md).toContain("> Review: FAIL\n> Tests broke");
  });

  it("cuts long results and keeps them inside the quote", () => {
    setLocale("en");
    const long = Array.from({ length: 25 }, (_, i) => `line ${i}`).join("\n");
    const md = formatReport(
      [task("T1", "done", {}, { result: long })],
      new Map(),
      new Date(T0),
    );
    expect(md).toContain("> line 19\n> …5 more lines");
    expect(md).not.toContain("line 20");
    expect(md).not.toContain("Checks:");
  });

  it("is written in Japanese by default", () => {
    const md = formatReport([task("T1", "done")], new Map(), new Date(T0));
    expect(md).toContain("# aihive 完了レポート");
    expect(md).toContain("- 状態: 完了");
  });
});

describe("writeReport", () => {
  it("writes a timestamped file under .aihive/reports", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-report-"));
    try {
      const file = writeReport(dir, "# r\n", new Date("2026-10-20T10:02:03Z"));
      expect(file).toBe(
        path.join(dir, ".aihive", "reports", "20261020-100203.md"),
      );
      expect(fs.readFileSync(file, "utf8")).toBe("# r\n");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
