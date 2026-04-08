import { describe, expect, it, vi } from "vitest";
import { TaskManager, extractField, extractList } from "../tasks.js";
import type { Message } from "../mailbox.js";

// ─── extractField ─────────────────────────────────────────────────────

describe("extractField", () => {
  it('returns the value for "task_id: abc"', () => {
    expect(extractField('task_id: abc', "task_id")).toBe("abc");
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
    const dep = tm.add("dep", "dependency", "agent-1", []);
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
    tm.handleMessage(makeMsg({ type: "result", id: "msg-42", payload: "done" }));
    expect(tm.get("msg-42")?.state).toBe("done");
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
