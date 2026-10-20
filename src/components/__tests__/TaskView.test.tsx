import { render } from "ink-testing-library";
import { afterEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../lib/i18n.js";
import type { Task } from "../../lib/tasks.js";
import { detailLines, TaskView, visibleTasks } from "../TaskView.js";

// ─── Helpers ─────────────────────────────────────────────────────────

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "T1",
    description: "do something",
    assignedTo: "Worker 1",
    state: "pending",
    blockedBy: [],
    createdAt: "2026-10-20T10:00:00Z",
    updatedAt: "2026-10-20T10:00:00Z",
    ...overrides,
  };
}

const tick = () => new Promise((r) => setTimeout(r, 20));

afterEach(() => setLocale("ja"));

// ─── visibleTasks ────────────────────────────────────────────────────

describe("visibleTasks", () => {
  const tasks = [
    makeTask({ id: "T1", state: "done", createdAt: "2026-10-20T10:00:00Z" }),
    makeTask({ id: "T2", state: "running", createdAt: "2026-10-20T10:01:00Z" }),
    makeTask({ id: "T3", state: "error", createdAt: "2026-10-20T10:02:00Z" }),
    makeTask({ id: "T4", state: "pending", createdAt: "2026-10-20T10:03:00Z" }),
  ];

  it("puts unfinished tasks first, stalled on top, then oldest first", () => {
    expect(visibleTasks(tasks, "all").map((t) => t.id)).toEqual([
      "T2",
      "T4",
      "T1",
      "T3",
    ]);
    expect(visibleTasks(tasks, "all", ["T4"]).map((t) => t.id)).toEqual([
      "T4",
      "T2",
      "T1",
      "T3",
    ]);
  });

  it("filters by open, done and failed", () => {
    const ids = (f: Parameters<typeof visibleTasks>[1]) =>
      visibleTasks(tasks, f).map((t) => t.id);
    expect(ids("open")).toEqual(["T2", "T4"]);
    expect(ids("done")).toEqual(["T1"]);
    expect(ids("error")).toEqual(["T3"]);
  });
});

// ─── detailLines ─────────────────────────────────────────────────────

describe("detailLines", () => {
  it("shows the request, result, dependencies and checks", () => {
    setLocale("en");
    const text = detailLines(
      makeTask({
        state: "error",
        blockedBy: ["T0"],
        request: "task_id: T1\nBuild it\nwith tests",
        result: "Review: FAIL",
        updatedAt: "2026-10-20T10:12:00Z",
      }),
      { passed: false, failedCommand: "npm test" },
      true,
    )
      .map((l) => l.text)
      .join("\n");
    expect(text).toContain("T1  failed  ⏱ stalled");
    expect(text).toContain("Waiting on: T0");
    expect(text).toContain("(12 min)");
    expect(text).toContain("Checks: failed (npm test)");
    expect(text).toContain("Request\ntask_id: T1\nBuild it\nwith tests");
    expect(text).toContain("Result\nReview: FAIL");
  });

  it("falls back to the description and marks a missing result", () => {
    setLocale("en");
    const text = detailLines(makeTask(), undefined, false)
      .map((l) => l.text)
      .join("\n");
    expect(text).toContain("Request\ndo something");
    expect(text).toContain("Result\n(none yet)");
    expect(text).not.toContain("Checks:");
  });
});

// ─── TaskView ────────────────────────────────────────────────────────

describe("TaskView", () => {
  const tasks = [
    makeTask({ id: "T1", description: "first", request: "first request" }),
    makeTask({
      id: "T2",
      description: "second",
      request: "second request",
      createdAt: "2026-10-20T10:01:00Z",
    }),
    makeTask({ id: "T3", state: "done", result: "third result" }),
  ];

  it("shows the selected task's detail and moves with j/k", async () => {
    const { lastFrame, stdin } = render(
      <TaskView tasks={tasks} height={20} onClose={() => {}} />,
    );
    expect(lastFrame()).toContain("first request");
    stdin.write("j");
    await tick();
    expect(lastFrame()).toContain("second request");
    stdin.write("k");
    await tick();
    expect(lastFrame()).toContain("first request");
  });

  it("cycles the filter with f", async () => {
    const { lastFrame, stdin } = render(
      <TaskView tasks={tasks} height={20} onClose={() => {}} />,
    );
    expect(lastFrame()).toContain("3 / 3 件");
    stdin.write("f"); // open
    await tick();
    expect(lastFrame()).toContain("2 / 3 件");
    stdin.write("f"); // done
    await tick();
    expect(lastFrame()).toContain("third result");
    stdin.write("f"); // failed
    await tick();
    expect(lastFrame()).toContain("表示するタスクはありません");
  });

  it("scrolls a long detail with J/K", async () => {
    const long = Array.from({ length: 40 }, (_, i) => `line ${i}`).join("\n");
    const { lastFrame, stdin } = render(
      <TaskView
        tasks={[makeTask({ request: long })]}
        height={14}
        onClose={() => {}}
      />,
    );
    expect(lastFrame()).toContain("line 0");
    expect(lastFrame()).not.toContain("line 30");
    for (let i = 0; i < 30; i++) stdin.write("J");
    await tick();
    expect(lastFrame()).not.toContain("line 0\n");
    expect(lastFrame()).toContain("line 30");
  });

  it("closes with Esc or T", async () => {
    const onClose = vi.fn();
    const { stdin } = render(
      <TaskView tasks={tasks} height={20} onClose={onClose} />,
    );
    stdin.write("T");
    await tick();
    stdin.write("\u001B");
    await tick();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
