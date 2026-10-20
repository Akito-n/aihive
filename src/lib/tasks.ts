import fs from "node:fs";
import path from "node:path";
import type { Message } from "./mailbox.js";

// ─── Types ───────────────────────────────────────────────────────────

export type TaskState =
  | "pending"
  | "blocked"
  | "running"
  | "review"
  | "done"
  | "error";

export interface Task {
  id: string;
  description: string;
  assignedTo: string;
  state: TaskState;
  blockedBy: string[];
  result?: string;
  createdAt: string;
  updatedAt: string;
}

export type TaskChangeHandler = (task: Task) => void;

const TASK_STATES = new Set<TaskState>([
  "pending",
  "blocked",
  "running",
  "review",
  "done",
  "error",
]);

// ─── TaskManager ─────────────────────────────────────────────────────

export class TaskManager {
  private tasks = new Map<string, Task>();
  private handlers: TaskChangeHandler[] = [];

  /** Register a change handler. Returns an unsubscribe function. */
  onChange(handler: TaskChangeHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /** Create a new task, auto-determining if it's blocked */
  add(
    id: string,
    description: string,
    assignedTo: string,
    blockedBy: string[] = [],
  ): Task {
    const now = new Date().toISOString();
    const hasUnresolved = blockedBy.some((depId) => {
      const dep = this.tasks.get(depId);
      return dep?.state !== "done";
    });

    const task: Task = {
      id,
      description,
      assignedTo,
      state: hasUnresolved ? "blocked" : "pending",
      blockedBy,
      createdAt: now,
      updatedAt: now,
    };

    this.tasks.set(id, task);
    this.notify(task);
    return task;
  }

  /**
   * Update task state based on an incoming message. `toRole` is the role of
   * the recipient: a task sent to a reviewer puts that task under review.
   */
  handleMessage(msg: Message, toRole?: string): void {
    const payload = typeof msg.payload === "string" ? msg.payload : "";
    const taskId = taskIdOf(msg) || msg.id;

    if (msg.type === "task") {
      const existing = this.tasks.get(taskId);
      if (!existing) {
        const blockedBy = Array.isArray(msg.blocked_by)
          ? msg.blocked_by.map(String)
          : extractList(payload, "blocked_by");
        this.add(taskId, summarize(payload), msg.to, blockedBy);
      } else if (toRole !== "reviewer") {
        // Sent again (e.g. sent back after a failed review)
        this.reopen(taskId, msg.to);
      }
      if (toRole === "reviewer") this.review(taskId);
    } else if (msg.type === "result") {
      this.complete(taskId, payload);
    } else if (msg.type === "error") {
      this.fail(taskId, payload);
    }
  }

  /** Put a finished or failed task back to pending for another attempt */
  reopen(id: string, assignedTo?: string): void {
    const task = this.tasks.get(id);
    if (!task || task.state === "blocked") return;
    task.state = "pending";
    if (assignedTo) task.assignedTo = assignedTo;
    task.updatedAt = new Date().toISOString();
    this.notify(task);
  }

  /** Mark task as running */
  start(id: string): void {
    const task = this.tasks.get(id);
    if (task && (task.state === "pending" || task.state === "blocked")) {
      task.state = "running";
      task.updatedAt = new Date().toISOString();
      this.notify(task);
    }
  }

  /** Mark task as in review */
  review(id: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.state = "review";
      task.updatedAt = new Date().toISOString();
      this.notify(task);
    }
  }

  /** Mark task as done and unblock dependents */
  complete(id: string, result?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.state = "done";
      task.result = result;
      task.updatedAt = new Date().toISOString();
      this.notify(task);
      this.unblockDependents(id);
    }
  }

  /** Mark task as failed */
  fail(id: string, error?: string): void {
    const task = this.tasks.get(id);
    if (task) {
      task.state = "error";
      task.result = error;
      task.updatedAt = new Date().toISOString();
      this.notify(task);
    }
  }

  /** Get all tasks */
  getAll(): Task[] {
    return Array.from(this.tasks.values());
  }

  /** Get task by ID */
  get(id: string): Task | undefined {
    return this.tasks.get(id);
  }

  /** Clear all tasks */
  clear(): void {
    this.tasks.clear();
  }

  /** Replace all tasks with saved ones (no change events) */
  restore(tasks: Task[]): void {
    this.tasks = new Map(tasks.map((t) => [t.id, t]));
  }

  // ─── Internal ────────────────────────────────────────────────────

  private notify(task: Task): void {
    for (const handler of this.handlers) {
      handler(task);
    }
  }

  /** Check if any blocked tasks can now proceed */
  private unblockDependents(completedId: string): void {
    for (const task of this.tasks.values()) {
      if (task.state !== "blocked") continue;
      if (!task.blockedBy.includes(completedId)) continue;

      const stillBlocked = task.blockedBy.some((depId) => {
        const dep = this.tasks.get(depId);
        return dep?.state !== "done";
      });

      if (!stillBlocked) {
        task.state = "pending";
        task.updatedAt = new Date().toISOString();
        this.notify(task);
      }
    }
  }
}

// ─── Persistence ─────────────────────────────────────────────────────

/** Where the task list is saved so a relaunched TUI can show it again */
export function tasksFilePath(projectDir: string): string {
  return path.join(projectDir, ".aihive", "tasks.json");
}

export function saveTasks(file: string, tasks: Task[]): void {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, `${JSON.stringify(tasks, null, 2)}\n`);
  } catch {
    // Best effort: the list still works in memory
  }
}

/** Saved tasks; a missing or broken file, or broken entries, are skipped */
export function loadTasks(file: string): Task[] {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return Array.isArray(parsed) ? parsed.filter(isTask) : [];
  } catch {
    return [];
  }
}

function isTask(value: unknown): value is Task {
  const t = value as Partial<Task> | null;
  return (
    typeof t === "object" &&
    t !== null &&
    typeof t.id === "string" &&
    typeof t.description === "string" &&
    typeof t.assignedTo === "string" &&
    typeof t.state === "string" &&
    TASK_STATES.has(t.state) &&
    Array.isArray(t.blockedBy) &&
    t.blockedBy.every((d) => typeof d === "string") &&
    (t.result === undefined || typeof t.result === "string") &&
    typeof t.createdAt === "string" &&
    typeof t.updatedAt === "string"
  );
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** The task id from the top-level field, or a `task_id:` line in the payload */
export function taskIdOf(msg: Message): string | undefined {
  const raw = (msg as { task_id?: unknown }).task_id;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (typeof raw === "number") return String(raw);
  return typeof msg.payload === "string"
    ? extractField(msg.payload, "task_id")
    : undefined;
}

/** First non-empty line of a payload, shortened for display */
function summarize(payload: string): string {
  const line =
    payload
      .split("\n")
      .map((l) => l.trim())
      .find((l) => l && !/^(task_id|blocked_by):/.test(l)) ?? "";
  return line.length > 100 ? `${line.slice(0, 99)}…` : line;
}

/** Extract a simple field value from payload text */
export function extractField(
  payload: string,
  field: string,
): string | undefined {
  const match = payload.match(new RegExp(`${field}:\\s*"?([^"\\n]+)"?`));
  return match?.[1]?.trim();
}

/** Extract a list field from payload text (e.g., blocked_by: [id1, id2]) */
export function extractList(payload: string, field: string): string[] {
  const match = payload.match(new RegExp(`${field}:\\s*\\[([^\\]]+)\\]`));
  if (!match) return [];
  return match[1]
    .split(",")
    .map((s) => s.trim().replace(/"/g, ""))
    .filter(Boolean);
}
