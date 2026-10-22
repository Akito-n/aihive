import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { Message } from "../mailbox.js";
import {
  extractField,
  extractList,
  loadTasks,
  StallMonitor,
  saveTasks,
  type Task,
  TaskManager,
} from "../tasks.js";

// ─── extractField ─────────────────────────────────────────────────────

describe("extractField", () => {
  it('returns the value for "task_id: abc"', () => {
    expect(extractField("task_id: abc", "task_id")).toBe("abc");
  });

  it("returns the value when quoted", () => {
    expect(extractField('task_id: "my-task"', "task_id")).toBe("my-task");
  });

  it("returns undefined when field is absent", () => {
    expect(extractField("some other payload", "task_id")).toBeUndefined();
  });

  it("trims surrounding whitespace from the value", () => {
    expect(extractField("task_id:   spaced  ", "task_id")).toBe("spaced");
  });
});

// ─── extractList ──────────────────────────────────────────────────────

describe("extractList", () => {
  it("parses a simple list", () => {
    expect(extractList("blocked_by: [a, b]", "blocked_by")).toEqual(["a", "b"]);
  });

  it("parses a list with quoted items", () => {
    expect(extractList('blocked_by: ["id1", "id2"]', "blocked_by")).toEqual([
      "id1",
      "id2",
    ]);
  });

  it("returns [] when field is absent", () => {
    expect(extractList("no list here", "blocked_by")).toEqual([]);
  });

  it("filters empty strings after split", () => {
    expect(extractList("blocked_by: [a]", "blocked_by")).toEqual(["a"]);
  });
});

// ─── TaskManager.add() ───────────────────────────────────────────────

describe("TaskManager.add()", () => {
  it("creates a pending task when blockedBy is empty", () => {
    const tm = new TaskManager();
    const task = tm.add("t1", "do something", "agent-1", []);
    expect(task.state).toBe("pending");
  });

  it("creates a blocked task when a dependency is not done", () => {
    const tm = new TaskManager();
    tm.add("dep", "dependency", "agent-1", []);
    const task = tm.add("t1", "child", "agent-2", ["dep"]);
    expect(task.state).toBe("blocked");
  });

  it("creates a pending task when all dependencies are done", () => {
    const tm = new TaskManager();
    const _dep = tm.add("dep", "dependency", "agent-1", []);
    tm.complete("dep");
    const task = tm.add("t1", "child", "agent-2", ["dep"]);
    expect(task.state).toBe("pending");
  });

  it("stores task retrievable by get()", () => {
    const tm = new TaskManager();
    tm.add("t1", "desc", "agent-1");
    expect(tm.get("t1")).toBeDefined();
    expect(tm.get("t1")?.description).toBe("desc");
  });
});

// ─── TaskManager.complete() ──────────────────────────────────────────

describe("TaskManager.complete()", () => {
  it("sets state to done", () => {
    const tm = new TaskManager();
    tm.add("t1", "desc", "agent-1");
    tm.complete("t1");
    expect(tm.get("t1")?.state).toBe("done");
  });

  it("stores result text", () => {
    const tm = new TaskManager();
    tm.add("t1", "desc", "agent-1");
    tm.complete("t1", "result payload");
    expect(tm.get("t1")?.result).toBe("result payload");
  });

  it("does nothing for unknown id", () => {
    const tm = new TaskManager();
    expect(() => tm.complete("unknown")).not.toThrow();
  });
});

// ─── TaskManager.unblockDependents() ─────────────────────────────────

describe("TaskManager unblock chain (A→B→C)", () => {
  it("unblocks B when A completes, then unblocks C when B completes", () => {
    const tm = new TaskManager();
    tm.add("A", "task A", "agent");
    tm.add("B", "task B", "agent", ["A"]);
    tm.add("C", "task C", "agent", ["B"]);

    expect(tm.get("B")?.state).toBe("blocked");
    expect(tm.get("C")?.state).toBe("blocked");

    tm.complete("A");
    expect(tm.get("B")?.state).toBe("pending");
    // C still blocked because B is not done yet
    expect(tm.get("C")?.state).toBe("blocked");

    tm.complete("B");
    expect(tm.get("C")?.state).toBe("pending");
  });

  it("stays blocked when only one of multiple dependencies is done", () => {
    const tm = new TaskManager();
    tm.add("A", "task A", "agent");
    tm.add("B", "task B", "agent");
    tm.add("C", "task C", "agent", ["A", "B"]);

    tm.complete("A");
    expect(tm.get("C")?.state).toBe("blocked");

    tm.complete("B");
    expect(tm.get("C")?.state).toBe("pending");
  });
});

// ─── TaskManager.handleMessage() ─────────────────────────────────────

describe("TaskManager.handleMessage()", () => {
  function makeMsg(overrides: Partial<Message>): Message {
    return {
      id: "msg-1",
      from: "coordinator",
      to: "worker-1",
      type: "task",
      payload: "do the thing",
      timestamp: new Date().toISOString(),
      ...overrides,
    };
  }

  it('type="task" creates a new task', () => {
    const tm = new TaskManager();
    tm.handleMessage(makeMsg({ type: "task", id: "msg-1", to: "worker-1" }));
    expect(tm.getAll()).toHaveLength(1);
  });

  it('type="task" keeps the full request text, capped', () => {
    const tm = new TaskManager();
    const payload = "task_id: T1\nFirst line\nSecond line";
    tm.handleMessage(makeMsg({ type: "task", payload }));
    expect(tm.get("T1")?.request).toBe(payload);
    expect(tm.get("T1")?.description).toBe("First line");

    tm.handleMessage(
      makeMsg({ type: "task", payload: `task_id: T2\n${"x".repeat(5000)}` }),
    );
    expect(tm.get("T2")?.request).toHaveLength(4000);
  });

  it('type="task" with existing task_id does not duplicate', () => {
    const tm = new TaskManager();
    const payload = "task_id: my-task\ndo something";
    tm.handleMessage(makeMsg({ type: "task", payload }));
    tm.handleMessage(makeMsg({ type: "task", payload }));
    expect(tm.getAll()).toHaveLength(1);
  });

  it('type="result" completes the task matched by task_id', () => {
    const tm = new TaskManager();
    tm.add("my-task", "desc", "worker-1");
    tm.handleMessage(
      makeMsg({ type: "result", payload: "task_id: my-task\nresult text" }),
    );
    expect(tm.get("my-task")?.state).toBe("done");
  });

  it('type="result" falls back to msg.id when task_id absent', () => {
    const tm = new TaskManager();
    tm.add("msg-42", "desc", "worker-1");
    tm.handleMessage(
      makeMsg({ type: "result", id: "msg-42", payload: "done" }),
    );
    expect(tm.get("msg-42")?.state).toBe("done");
  });

  it('type="result" without task_id completes the sender\'s only open task', () => {
    const tm = new TaskManager();
    tm.add("subtask-002", "desc", "worker-2");
    tm.add("subtask-003", "desc", "worker-3");
    tm.handleMessage(
      makeMsg({
        type: "result",
        id: "result-worker2-002",
        from: "worker-2",
        to: "coordinator",
        payload: "found it",
      }),
    );
    expect(tm.get("subtask-002")?.state).toBe("done");
    expect(tm.get("subtask-003")?.state).toBe("pending");
  });

  it('type="result" without task_id leaves tasks alone when the sender has several open', () => {
    const tm = new TaskManager();
    tm.add("a", "desc", "worker-2");
    tm.add("b", "desc", "worker-2");
    tm.handleMessage(
      makeMsg({ type: "result", id: "r1", from: "worker-2", payload: "x" }),
    );
    expect(tm.get("a")?.state).toBe("pending");
    expect(tm.get("b")?.state).toBe("pending");
  });

  it('type="error" without task_id fails the sender\'s only open task', () => {
    const tm = new TaskManager();
    tm.add("t1", "desc", "worker-1");
    tm.handleMessage(
      makeMsg({ type: "error", id: "e1", from: "worker-1", payload: "x" }),
    );
    expect(tm.get("t1")?.state).toBe("error");
  });

  it('type="error" marks task as failed', () => {
    const tm = new TaskManager();
    tm.add("my-task", "desc", "worker-1");
    tm.handleMessage(
      makeMsg({ type: "error", payload: "task_id: my-task\nfailed" }),
    );
    expect(tm.get("my-task")?.state).toBe("error");
  });
});

describe("TaskManager.handleMessage() with the instruction protocol", () => {
  const msg = (
    m: Partial<Message> & Pick<Message, "type" | "to">,
  ): Message => ({
    id: `m-${Math.random()}`,
    from: "coordinator",
    payload: "",
    timestamp: "2026-01-01T00:00:00Z",
    ...m,
  });

  it("follows a task through review, send-back and approval", () => {
    const tm = new TaskManager();
    tm.handleMessage(
      msg({
        type: "task",
        to: "worker-1",
        task_id: "T1-1",
        payload: "Add a flag\nDetails",
      }),
      "worker",
    );
    expect(tm.get("T1-1")).toMatchObject({
      state: "pending",
      assignedTo: "worker-1",
      description: "Add a flag",
    });

    tm.handleMessage(
      msg({
        type: "result",
        from: "worker-1",
        to: "coordinator",
        task_id: "T1-1",
      }),
    );
    tm.handleMessage(
      msg({ type: "task", to: "reviewer", task_id: "T1-1" }),
      "reviewer",
    );
    expect(tm.get("T1-1")?.state).toBe("review");
    // The reviewer now owns it, so a stall reminder goes to the reviewer
    expect(tm.get("T1-1")?.assignedTo).toBe("reviewer");

    tm.handleMessage(
      msg({
        type: "error",
        from: "reviewer",
        to: "coordinator",
        task_id: "T1-1",
      }),
    );
    expect(tm.get("T1-1")?.state).toBe("error");

    tm.handleMessage(
      msg({ type: "task", to: "worker-1", task_id: "T1-1" }),
      "worker",
    );
    expect(tm.get("T1-1")?.state).toBe("pending");

    tm.handleMessage(
      msg({ type: "task", to: "reviewer", task_id: "T1-1" }),
      "reviewer",
    );
    tm.handleMessage(
      msg({
        type: "result",
        from: "reviewer",
        to: "coordinator",
        task_id: "T1-1",
      }),
    );
    expect(tm.get("T1-1")?.state).toBe("done");
    expect(tm.getAll()).toHaveLength(1);
  });

  it("reads top-level blocked_by and unblocks when the dependency is done", () => {
    const tm = new TaskManager();
    tm.handleMessage(msg({ type: "task", to: "worker-1", task_id: "A" }));
    tm.handleMessage(
      msg({ type: "task", to: "worker-2", task_id: "B", blocked_by: ["A"] }),
    );
    expect(tm.get("B")?.state).toBe("blocked");
    tm.handleMessage(msg({ type: "result", to: "coordinator", task_id: "A" }));
    expect(tm.get("B")?.state).toBe("pending");
  });

  it("accepts a numeric task_id and a non-string payload", () => {
    const tm = new TaskManager();
    const raw = { type: "task", to: "worker-1", task_id: 7, payload: { a: 1 } };
    expect(() =>
      tm.handleMessage(msg(raw as unknown as Message)),
    ).not.toThrow();
    expect(tm.get("7")).toBeDefined();
  });
});

// ─── TaskManager.onChange() ──────────────────────────────────────────

describe("TaskManager.onChange()", () => {
  it("calls handler on add()", () => {
    const tm = new TaskManager();
    const handler = vi.fn();
    tm.onChange(handler);
    tm.add("t1", "desc", "agent");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler.mock.calls[0][0].id).toBe("t1");
  });

  it("calls handler on complete()", () => {
    const tm = new TaskManager();
    const handler = vi.fn();
    tm.add("t1", "desc", "agent");
    tm.onChange(handler);
    tm.complete("t1");
    expect(handler).toHaveBeenCalled();
    expect(handler.mock.calls[0][0].state).toBe("done");
  });
});

// ─── onChange unsubscribe ─────────────────────────────────────────────

describe("TaskManager.onChange", () => {
  it("stops notifying after the returned unsubscribe is called", () => {
    const tm = new TaskManager();
    const handler = vi.fn();
    const unsubscribe = tm.onChange(handler);
    tm.add("t1", "first", "worker-1");
    expect(handler).toHaveBeenCalledTimes(1);

    unsubscribe();
    tm.add("t2", "second", "worker-1");
    expect(handler).toHaveBeenCalledTimes(1);
  });
});

// ─── Persistence ──────────────────────────────────────────────────────

describe("saveTasks / loadTasks", () => {
  const withTmp = (fn: (file: string) => void) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-tasks-"));
    try {
      fn(path.join(dir, ".aihive", "tasks.json"));
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  };

  it("round-trips tasks, and restore() brings them back into a manager", () => {
    withTmp((file) => {
      const tm = new TaskManager();
      tm.add("T1", "build", "worker-1");
      tm.add("T2", "test", "worker-2", ["T1"]);
      tm.complete("T1", "ok");
      saveTasks(file, tm.getAll());

      const restored = new TaskManager();
      restored.restore(loadTasks(file));
      expect(restored.getAll()).toEqual(tm.getAll());

      // Dependencies keep working after a restore
      restored.add("T3", "lint", "worker-1", ["T1"]);
      expect(restored.get("T3")?.state).toBe("pending");
    });
  });

  it("returns an empty list for a missing or broken file", () => {
    withTmp((file) => {
      expect(loadTasks(file)).toEqual([]);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, "{not json");
      expect(loadTasks(file)).toEqual([]);
    });
  });

  it("skips entries that are not valid tasks", () => {
    withTmp((file) => {
      const tm = new TaskManager();
      const good = tm.add("T1", "build", "worker-1");
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(
        file,
        JSON.stringify([good, { ...good, id: "T2", state: "flying" }, null]),
      );
      expect(loadTasks(file).map((t) => t.id)).toEqual(["T1"]);
    });
  });
});

// ─── Stall detection ──────────────────────────────────────────────────

describe("StallMonitor", () => {
  const MIN = 60_000;
  const at = (minutes: number) => new Date(minutes * MIN).toISOString();
  const task = (
    id: string,
    state: Task["state"],
    updatedMin: number,
  ): Task => ({
    id,
    description: "",
    assignedTo: "worker-1",
    state,
    blockedBy: [],
    createdAt: at(0),
    updatedAt: at(updatedMin),
  });

  it("flags waiting tasks with no update for the threshold, not finished or blocked ones", () => {
    const monitor = new StallMonitor(15 * MIN);
    const tasks = [
      task("pending", "pending", 0),
      task("running", "running", 0),
      task("review", "review", 0),
      task("fresh", "pending", 10),
      task("done", "done", 0),
      task("error", "error", 0),
      task("blocked", "blocked", 0),
    ];
    const { stalled } = monitor.check(tasks, 20 * MIN);
    expect(stalled.map((t) => t.id)).toEqual(["pending", "running", "review"]);
  });

  it("reminds once per stall, and again after the task moves and stalls anew", () => {
    const monitor = new StallMonitor(15 * MIN);
    const t = task("T1", "pending", 0);

    expect(monitor.check([t], 15 * MIN).toRemind).toEqual([t]);
    const later = monitor.check([t], 40 * MIN);
    expect(later.stalled).toEqual([t]);
    expect(later.toRemind).toEqual([]);

    const moved = { ...t, state: "review" as const, updatedAt: at(41) };
    expect(monitor.check([moved], 50 * MIN).stalled).toEqual([]);
    expect(monitor.check([moved], 56 * MIN).toRemind).toEqual([moved]);
  });

  it("does nothing when turned off with 0", () => {
    const monitor = new StallMonitor(0);
    expect(monitor.check([task("T1", "pending", 0)], 999 * MIN)).toEqual({
      stalled: [],
      toRemind: [],
    });
  });
});
