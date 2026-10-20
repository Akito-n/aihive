import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import { worktreeDirFor } from "./worktrees.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface CheckRun {
  command: string;
  exitCode: number | null; // null when it timed out or could not start
  timedOut: boolean;
  durationMs: number;
}

export interface CheckResult {
  passed: boolean;
  runs: CheckRun[]; // in order; stops after the first failure
  failedCommand?: string;
  outputTail: string; // last lines of the failing command, or of the last one
}

/** How long one check command may run */
export const CHECK_TIMEOUT_MS = 10 * 60_000;

/** Lines of output kept for the report */
const OUTPUT_TAIL_LINES = 40;

// ─── Running ─────────────────────────────────────────────────────────

/**
 * Run the user's check commands one by one in `cwd`, stopping at the first
 * failure. Commands come from the user's own config, so they run in a shell.
 */
export async function runChecks(
  commands: string[],
  cwd: string,
  timeoutMs = CHECK_TIMEOUT_MS,
): Promise<CheckResult> {
  const runs: CheckRun[] = [];
  let outputTail = "";
  for (const command of commands) {
    const { run, output } = await runOne(command, cwd, timeoutMs);
    runs.push(run);
    outputTail = tail(output, OUTPUT_TAIL_LINES);
    if (run.exitCode !== 0) {
      return { passed: false, runs, failedCommand: command, outputTail };
    }
  }
  return { passed: true, runs, outputTail };
}

function runOne(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<{ run: CheckRun; output: string }> {
  const started = Date.now();
  return new Promise((resolve) => {
    let output = "";
    let timedOut = false;
    const child = spawn(command, {
      cwd,
      shell: true,
      // Own process group, so a timeout can stop the whole command tree
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, CI: "1", FORCE_COLOR: "0" },
    });
    const append = (chunk: Buffer) => {
      // Keep memory bounded on chatty commands
      output = (output + chunk.toString()).slice(-200_000);
    };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    let finished = false;
    const finish = (exitCode: number | null) => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      resolve({
        run: {
          command,
          exitCode: timedOut ? null : exitCode,
          timedOut,
          durationMs: Date.now() - started,
        },
        output,
      });
    };
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        if (child.pid && process.platform !== "win32") {
          process.kill(-child.pid, "SIGKILL");
        } else {
          child.kill("SIGKILL");
        }
      } catch {
        // Already gone
      }
      // Grandchildren may hold the pipes open; do not wait for them
      finish(null);
    }, timeoutMs);
    child.on("error", (e) => {
      output += `\n${e.message}`;
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

// ─── Runner ──────────────────────────────────────────────────────────

export interface CheckReport {
  worker: string;
  taskId?: string;
  result: CheckResult;
  payload: string; // body of the check-result message
}

/**
 * Runs the checks for a worker that reported a result: in its worktree when
 * it has one, otherwise in the project dir. Runs in the same folder queue up
 * so two reports never check the same tree at once.
 */
export class CheckRunner {
  private chains = new Map<string, Promise<void>>();

  constructor(
    private commands: string[],
    private projectDir: string,
    private onDone: (report: CheckReport) => void,
    private timeoutMs = CHECK_TIMEOUT_MS,
  ) {}

  /** Folder the checks for this worker run in */
  folderFor(worker: string): string {
    const dir = worktreeDirFor(this.projectDir, worker);
    return fs.existsSync(dir) ? dir : this.projectDir;
  }

  /** Queue a run; resolves when this run has been reported */
  run(worker: string, taskId?: string): Promise<void> {
    const cwd = this.folderFor(worker);
    const previous = this.chains.get(cwd) ?? Promise.resolve();
    const next = previous.then(async () => {
      const result = await runChecks(this.commands, cwd, this.timeoutMs);
      const payload = formatCheckReport(result, {
        taskId,
        worker,
        cwd,
        commit: headCommit(cwd),
      });
      this.onDone({ worker, taskId, result, payload });
    });
    const settled = next.catch(() => {});
    this.chains.set(cwd, settled);
    return settled;
  }
}

// ─── Reporting ───────────────────────────────────────────────────────

/** Short commit hash checked out in `cwd`, if it is a git work tree */
export function headCommit(cwd: string): string | undefined {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

/** Payload of the `check-result` message: YAML-like fields, then the output */
export function formatCheckReport(
  result: CheckResult,
  ctx: { taskId?: string; worker: string; cwd: string; commit?: string },
): string {
  const lines = [
    ...(ctx.taskId ? [`task_id: ${ctx.taskId}`] : []),
    `worker: ${ctx.worker}`,
    `folder: ${ctx.cwd}`,
    ...(ctx.commit ? [`commit: ${ctx.commit}`] : []),
    `passed: ${result.passed}`,
    ...(result.failedCommand
      ? [`failed_command: ${result.failedCommand}`]
      : []),
    "runs:",
    ...result.runs.map(
      (r) =>
        `  - ${r.command} → ${r.timedOut ? "timed out" : `exit ${r.exitCode}`} (${Math.round(r.durationMs / 1000)}s)`,
    ),
  ];
  if (!result.passed && result.outputTail) {
    lines.push(
      "output: |",
      ...result.outputTail.split("\n").map((l) => `  ${l}`),
    );
  }
  return lines.join("\n");
}

function tail(text: string, lines: number): string {
  return text.trimEnd().split("\n").slice(-lines).join("\n");
}
