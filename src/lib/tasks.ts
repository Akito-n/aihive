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

// ─── TaskManager ─────────────────────────────────────────────────────

export class TaskManager {
  private tasks = new Map<string, Task>();
  private handlers: TaskChangeHandler[] = [];

  /** Register a change handler */
  onChange(handler: TaskChangeHandler): void {
    this.handlers.push(handler);
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
      return !dep || dep.state !== "done";
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

  /** Update task state based on an incoming message */
  handleMessage(msg: Message): void {
    if (msg.type === "task") {
      // Extract task ID from payload if present, or use message ID
      const taskId = extractField(msg.payload, "task_id") || msg.id;
      const blockedBy = extractList(msg.payload, "blocked_by");
      const existing = this.tasks.get(taskId);

      if (!existing) {
        this.add(taskId, msg.payload.slice(0, 100), msg.to, blockedBy);
      }
    } else if (msg.type === "result") {
      const taskId = extractField(msg.payload, "task_id") || msg.id;
      this.complete(taskId, msg.payload);
    } else if (msg.type === "error") {
      const taskId = extractField(msg.payload, "task_id") || msg.id;
      this.fail(taskId, msg.payload);
    }
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
        return !dep || dep.state !== "done";
      });

      if (!stillBlocked) {
        task.state = "pending";
        task.updatedAt = new Date().toISOString();
        this.notify(task);
      }
    }
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

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
