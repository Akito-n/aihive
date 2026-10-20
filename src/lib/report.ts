import fs from "node:fs";
import path from "node:path";
import { t, tf } from "./i18n.js";
import type { Task } from "./tasks.js";

// ─── Types ───────────────────────────────────────────────────────────

/** Latest check outcome for a task, as reported by the CheckRunner */
export interface TaskCheck {
  passed: boolean;
  failedCommand?: string;
  commit?: string;
}

/** How long every task must stay finished before the report is written */
export const REPORT_SETTLE_MS = 2 * 60_000;

/** Lines of each task's result kept in the report */
const RESULT_LINES = 20;

// ─── When to report ──────────────────────────────────────────────────

const FINISHED = new Set(["done", "error"]);

/**
 * Decides when to write a completion report: once every task is done or
 * failed and nothing has changed for `settleMs`. A worker's result marks its
 * task done before the review starts, so waiting a little avoids reporting
 * in that gap. Each finished set of tasks is reported once; reopening a task
 * and finishing it again makes a new report.
 */
export class CompletionReporter {
  private reported?: string;

  constructor(private settleMs = REPORT_SETTLE_MS) {}

  /** Treat the current tasks as already reported (e.g. restored on relaunch) */
  prime(tasks: Task[]): void {
    if (allFinished(tasks)) this.reported = keyOf(tasks);
  }

  /** True when a report should be written now; marks it as reported */
  due(tasks: Task[], now: number): boolean {
    if (!allFinished(tasks)) return false;
    const last = Math.max(...tasks.map((t) => Date.parse(t.updatedAt)));
    if (now - last < this.settleMs) return false;
    const key = keyOf(tasks);
    if (key === this.reported) return false;
    this.reported = key;
    return true;
  }
}

function allFinished(tasks: Task[]): boolean {
  return tasks.length > 0 && tasks.every((t) => FINISHED.has(t.state));
}

function keyOf(tasks: Task[]): string {
  return tasks
    .map((t) => `${t.id}@${t.updatedAt}`)
    .sort()
    .join("|");
}

// ─── Formatting ──────────────────────────────────────────────────────

/** Markdown completion report in the current locale */
export function formatReport(
  tasks: Task[],
  checks: ReadonlyMap<string, TaskCheck>,
  now: Date,
): string {
  const sorted = [...tasks].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
  const done = sorted.filter((t) => t.state === "done").length;
  const start = Math.min(...sorted.map((t) => Date.parse(t.createdAt)));
  const end = Math.max(...sorted.map((t) => Date.parse(t.updatedAt)));

  const lines = [
    t("report.title"),
    "",
    tf("report.created", { time: now.toISOString() }),
    tf("report.summary", {
      total: sorted.length,
      done,
      failed: sorted.length - done,
    }),
    tf("report.elapsed", { duration: formatDuration(end - start) }),
  ];

  for (const task of sorted) {
    const check = checks.get(task.id);
    lines.push(
      "",
      `## ${task.id}: ${oneLine(task.description)}`,
      "",
      tf("report.state", {
        state: t(task.state === "done" ? "report.done" : "report.failed"),
      }),
      tf("report.assignee", { name: task.assignedTo }),
      tf("report.duration", {
        duration: formatDuration(
          Date.parse(task.updatedAt) - Date.parse(task.createdAt),
        ),
      }),
    );
    if (check) {
      lines.push(
        check.passed
          ? tf("report.checksPassed", { commit: check.commit ?? "-" })
          : tf("report.checksFailed", { command: check.failedCommand ?? "-" }),
      );
    }
    const result = (task.result ?? "").trim();
    if (result) {
      lines.push(
        t("report.result"),
        "",
        ...quote(result.split("\n"), RESULT_LINES),
      );
    }
  }
  return `${lines.join("\n")}\n`;
}

/** Human-friendly length like "<1 min", "12 min" or "1 h 5 min" */
export function formatDuration(ms: number): string {
  const minutes = Math.floor(Math.max(0, ms) / 60_000);
  if (minutes < 1) return t("report.underMinute");
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0
    ? tf("report.hoursMinutes", { h, m })
    : tf("report.minutes", { m });
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function quote(lines: string[], limit: number): string[] {
  const kept = lines.slice(0, limit).map((l) => (l ? `> ${l}` : ">"));
  if (lines.length > limit) {
    kept.push(`> ${tf("report.moreLines", { count: lines.length - limit })}`);
  }
  return kept;
}

// ─── Writing ─────────────────────────────────────────────────────────

/** Where completion reports are written */
export function reportsDir(projectDir: string): string {
  return path.join(projectDir, ".aihive", "reports");
}

/** Write the report as `<YYYYMMDD-HHMMSS>.md`; returns its path */
export function writeReport(
  projectDir: string,
  markdown: string,
  now: Date,
): string {
  const dir = reportsDir(projectDir);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = now
    .toISOString()
    .replace(/\.\d+Z$/, "")
    .replace(/[-:]/g, "")
    .replace("T", "-");
  const file = path.join(dir, `${stamp}.md`);
  fs.writeFileSync(file, markdown);
  return file;
}
