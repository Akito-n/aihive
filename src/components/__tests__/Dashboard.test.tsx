import { render } from "ink-testing-library";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { Dashboard } from "../Dashboard.js";
import type { AgentInfo } from "../../lib/tmux.js";
import type { Task } from "../../lib/tasks.js";

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
    expect(frame).toContain("error");
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
    const agents = [makeAgent({ cli: "claude", model: "sonnet", name: "Claude" })];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? "";
    // Should contain model but NOT "claude:sonnet"
    expect(frame).toContain("sonnet");
    expect(frame).not.toContain("claude:sonnet");
  });
});
