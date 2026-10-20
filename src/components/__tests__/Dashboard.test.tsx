import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../lib/i18n.js";
import type { Task } from "../../lib/tasks.js";
import { setTheme } from "../../lib/theme.js";
import type { AgentInfo } from "../../lib/tmux.js";
import { currentTaskOf, Dashboard, tasksToList } from "../Dashboard.js";

// ─── Helpers ─────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: "Worker 1",
    role: "worker",
    status: "pending",
    paneTarget: "workers.0",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: "t1",
    description: "do something",
    assignedTo: "worker-1",
    state: "pending",
    blockedBy: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// Most expectations below use the English labels and the classic look
beforeEach(() => {
  setLocale("en");
  setTheme("classic");
});
afterEach(() => {
  setLocale("ja");
  setTheme("retro");
});

// ─── selectedIndex highlight ──────────────────────────────────────────

describe("Dashboard selectedIndex", () => {
  it("shows ▶ for the selected agent", () => {
    const agents = [makeAgent({ name: "Alpha" }), makeAgent({ name: "Beta" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? "";
    // The first line with Alpha should have ▶
    const lines = frame.split("\n");
    const alphaLine = lines.find((l) => l.includes("Alpha"));
    expect(alphaLine).toContain("▶");
  });

  it("shows ' ' (space) for non-selected agents", () => {
    const agents = [makeAgent({ name: "Alpha" }), makeAgent({ name: "Beta" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    const betaLine = lines.find((l) => l.includes("Beta"));
    // Beta is not selected, so no ▶ on that line
    expect(betaLine).not.toContain("▶");
  });

  it("highlights the correct agent when selectedIndex=1", () => {
    const agents = [makeAgent({ name: "Alpha" }), makeAgent({ name: "Beta" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={1} />,
    );
    const frame = lastFrame() ?? "";
    const lines = frame.split("\n");
    const betaLine = lines.find((l) => l.includes("Beta"));
    expect(betaLine).toContain("▶");
  });
});

// ─── ROLE_ICON / ROLE_COLOR fallback ─────────────────────────────────

describe("Dashboard role icon fallback", () => {
  it("shows ⬡ for unknown roles", () => {
    const agents = [makeAgent({ role: "unknown-role", name: "Mystery" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain("⬡");
  });

  it("shows 👑 for orchestrator role", () => {
    const agents = [makeAgent({ role: "orchestrator", name: "Boss" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain("👑");
  });

  it("shows 🔨 for worker role", () => {
    const agents = [makeAgent({ role: "worker", name: "Doer" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain("🔨");
  });
});

// ─── Tasks section visibility ─────────────────────────────────────────

describe("Dashboard Tasks section", () => {
  it("hides Tasks section when tasks array is empty", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} tasks={[]} />,
    );
    expect(lastFrame()).not.toContain("Tasks");
  });

  it("shows Tasks section when tasks exist", () => {
    const agents = [makeAgent()];
    const tasks = [makeTask()];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} tasks={tasks} />,
    );
    expect(lastFrame()).toContain("Tasks");
  });

  it("displays task state counts correctly", () => {
    const agents = [makeAgent()];
    const tasks = [
      makeTask({ id: "t1", state: "pending" }),
      makeTask({ id: "t2", state: "pending" }),
      makeTask({ id: "t3", state: "done" }),
    ];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} tasks={tasks} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("2");
    expect(frame).toContain("pending");
    expect(frame).toContain("1");
    expect(frame).toContain("done");
  });

  it("shows all task states with correct counts", () => {
    const agents = [makeAgent()];
    const tasks = [
      makeTask({ id: "t1", state: "running" }),
      makeTask({ id: "t2", state: "blocked" }),
      makeTask({ id: "t3", state: "error" }),
    ];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} tasks={tasks} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("running");
    expect(frame).toContain("blocked");
    expect(frame).toContain("failed");
  });
});

// ─── Skills section visibility ────────────────────────────────────────

describe("Dashboard Skills section", () => {
  it("hides Skills section when approved=0 and proposed=0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Dashboard
        agents={agents}
        selectedIndex={0}
        skillCounts={{ proposed: 0, approved: 0, rejected: 0 }}
      />,
    );
    expect(lastFrame()).not.toContain("Skills");
  });

  it("shows Skills section when approved > 0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Dashboard
        agents={agents}
        selectedIndex={0}
        skillCounts={{ proposed: 0, approved: 2, rejected: 0 }}
      />,
    );
    expect(lastFrame()).toContain("Skills");
    expect(lastFrame()).toContain("2");
    expect(lastFrame()).toContain("approved");
  });

  it("shows Skills section when proposed > 0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Dashboard
        agents={agents}
        selectedIndex={0}
        skillCounts={{ proposed: 3, approved: 0, rejected: 0 }}
      />,
    );
    expect(lastFrame()).toContain("Skills");
    expect(lastFrame()).toContain("3");
    expect(lastFrame()).toContain("pending");
  });

  it("hides Skills section when skillCounts is not provided", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    expect(lastFrame()).not.toContain("Skills");
  });
});

// ─── Memory section visibility ────────────────────────────────────────

describe("Dashboard Memory section", () => {
  it("hides Memory section when memoryCount=0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} memoryCount={0} />,
    );
    expect(lastFrame()).not.toContain("Memory");
  });

  it("shows Memory section when memoryCount > 0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} memoryCount={5} />,
    );
    expect(lastFrame()).toContain("Memory");
    expect(lastFrame()).toContain("5");
  });
});

// ─── model display ───────────────────────────────────────────────────

describe("Dashboard model display", () => {
  it("shows model name in brackets when provided", () => {
    const agents = [makeAgent({ model: "opus", name: "Boss" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain("opus");
  });

  it("prepends cli prefix when cli is not 'claude'", () => {
    const agents = [makeAgent({ cli: "codex", model: "o3", name: "Codex" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    expect(lastFrame()).toContain("codex:o3");
  });

  it("does not show cli prefix when cli is 'claude'", () => {
    const agents = [
      makeAgent({ cli: "claude", model: "sonnet", name: "Claude" }),
    ];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? "";
    // Should contain model but NOT "claude:sonnet"
    expect(frame).toContain("sonnet");
    expect(frame).not.toContain("claude:sonnet");
  });
});

describe("Dashboard task list", () => {
  it("lists tasks with their id and assignee", () => {
    const { lastFrame } = render(
      <Dashboard
        agents={[]}
        selectedIndex={0}
        tasks={[
          makeTask({ id: "T1-2", assignedTo: "worker-2", state: "review" }),
        ]}
      />,
    );
    expect(lastFrame()).toContain("T1-2");
    expect(lastFrame()).toContain("worker-2");
  });

  it("shows unfinished tasks first and counts the rest", () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      makeTask({
        id: `t${i}`,
        state: i < 4 ? "done" : "pending",
        updatedAt: `2026-01-01T00:00:0${i}Z`,
      }),
    );
    expect(tasksToList(tasks).map((t) => t.id)).toEqual([
      "t7",
      "t6",
      "t5",
      "t4",
      "t3",
      "t2",
    ]);
    const { lastFrame } = render(
      <Dashboard agents={[]} selectedIndex={0} tasks={tasks} />,
    );
    expect(lastFrame()).toContain("+2 more");
  });

  it("puts stalled tasks at the top and marks them", () => {
    const tasks = Array.from({ length: 8 }, (_, i) =>
      makeTask({
        id: `t${i}`,
        state: "pending",
        updatedAt: `2026-01-01T00:00:0${i}Z`,
      }),
    );
    expect(tasksToList(tasks, 3, ["t0"]).map((t) => t.id)).toEqual([
      "t0",
      "t7",
      "t6",
    ]);
    const { lastFrame } = render(
      <Dashboard
        agents={[]}
        selectedIndex={0}
        tasks={tasks}
        stalledIds={["t0"]}
      />,
    );
    expect(lastFrame()).toContain("⏱ 1 stalled");
    expect(lastFrame()).toContain("⏱ t0");
  });
});

// ─── Current task per agent ───────────────────────────────────────────

describe("Dashboard current task", () => {
  const now = Date.parse("2026-10-20T10:30:00Z");

  it("picks the agent's most recently updated active task", () => {
    const agent = makeAgent({ name: "Worker 1" });
    const tasks = [
      makeTask({ id: "T1", assignedTo: "worker-1", state: "done" }),
      makeTask({
        id: "T2",
        assignedTo: "worker-1",
        state: "running",
        updatedAt: "2026-10-20T10:00:00Z",
      }),
      makeTask({
        id: "T3",
        assignedTo: "Worker 1",
        state: "pending",
        updatedAt: "2026-10-20T10:10:00Z",
      }),
      makeTask({ id: "T4", assignedTo: "worker-2", state: "running" }),
    ];
    expect(currentTaskOf(agent, tasks)?.id).toBe("T3");
    expect(currentTaskOf(makeAgent({ name: "Reviewer" }), tasks)).toBe(
      undefined,
    );
  });

  it("shows each agent's task with how long since it last moved", () => {
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent({ name: "Worker 1" }), makeAgent({ name: "Scout" })]}
        selectedIndex={0}
        tasks={[
          makeTask({
            id: "T1-2",
            description: "Add login",
            assignedTo: "worker-1",
            state: "running",
            updatedAt: "2026-10-20T10:18:00Z",
          }),
        ]}
        now={now}
      />,
    );
    const lines = (lastFrame() ?? "").split("\n");
    const workerIdx = lines.findIndex((l) => l.includes("Worker 1"));
    expect(lines[workerIdx + 1]).toContain("└ T1-2 12 min Add login");
    const scoutIdx = lines.findIndex((l) => l.includes("Scout"));
    expect(lines[scoutIdx + 1]).toContain("└ idle");
  });

  it("marks a stalled current task", () => {
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent({ name: "Worker 1" })]}
        selectedIndex={0}
        tasks={[
          makeTask({ id: "T9", assignedTo: "worker-1", state: "review" }),
        ]}
        stalledIds={["T9"]}
      />,
    );
    expect(lastFrame()).toContain("⏱ T9");
  });

  it("uses Japanese headings in the default locale", () => {
    setLocale("ja");
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent()]}
        selectedIndex={0}
        tasks={[makeTask({ state: "error" })]}
        memoryCount={2}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("エージェント");
    expect(frame).toContain("タスク");
    expect(frame).toContain("✗ 1 失敗");
    expect(frame).toContain("└ 待機中");
    expect(frame).toContain("🧠 2 件");
  });
});
