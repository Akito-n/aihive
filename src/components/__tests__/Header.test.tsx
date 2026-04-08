import { render } from "ink-testing-library";
import React from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../../lib/i18n.js";
import { Header } from "../Header.js";
import type { AgentInfo } from "../../lib/tmux.js";

// Use English locale for predictable assertions
beforeEach(() => {
  setLocale("en");
});

// ─── Helpers ─────────────────────────────────────────────────────────

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: "Worker 1",
    role: "worker",
    model: "sonnet",
    status: "running",
    paneTarget: "workers.0",
    ...overrides,
  };
}

// ─── modelCounts aggregation ──────────────────────────────────────────

describe("Header modelCounts", () => {
  it("shows '2x sonnet' when two agents use the same model", () => {
    const agents = [
      makeAgent({ model: "sonnet" }),
      makeAgent({ model: "sonnet", name: "Worker 2" }),
    ];
    const { lastFrame } = render(
      <Header state="running" agents={agents} />,
    );
    expect(lastFrame()).toContain("2x sonnet");
  });

  it("shows multiple models in summary", () => {
    const agents = [
      makeAgent({ model: "sonnet" }),
      makeAgent({ model: "sonnet", name: "Worker 2" }),
      makeAgent({ model: "opus", name: "Boss", role: "orchestrator" }),
    ];
    const { lastFrame } = render(
      <Header state="running" agents={agents} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("2x sonnet");
    expect(frame).toContain("1x opus");
  });

  it("adds cli: prefix for non-claude CLI agents", () => {
    const agents = [
      makeAgent({ cli: "codex", model: "o3", name: "Codex Agent" }),
    ];
    const { lastFrame } = render(
      <Header state="running" agents={agents} />,
    );
    expect(lastFrame()).toContain("codex:o3");
  });

  it("does not add cli prefix for claude CLI", () => {
    const agents = [makeAgent({ cli: "claude", model: "sonnet" })];
    const { lastFrame } = render(
      <Header state="running" agents={agents} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("1x sonnet");
    expect(frame).not.toContain("claude:sonnet");
  });

  it("shows 'default' when model is undefined", () => {
    const agents = [makeAgent({ model: undefined })];
    const { lastFrame } = render(
      <Header state="running" agents={agents} />,
    );
    expect(lastFrame()).toContain("1x default");
  });
});

// ─── State label ──────────────────────────────────────────────────────

describe("Header state label", () => {
  it("shows RUNNING when state=running", () => {
    const { lastFrame } = render(
      <Header state="running" agents={[makeAgent()]} />,
    );
    expect(lastFrame()).toContain("RUNNING");
  });

  it("shows IDLE when state=idle", () => {
    const { lastFrame } = render(
      <Header state="idle" agents={[makeAgent()]} />,
    );
    expect(lastFrame()).toContain("IDLE");
  });

  it("shows STARTING when state=starting", () => {
    const { lastFrame } = render(
      <Header state="starting" agents={[makeAgent()]} />,
    );
    expect(lastFrame()).toContain("STARTING");
  });
});

// ─── Agent count ──────────────────────────────────────────────────────

describe("Header agent count", () => {
  it("shows correct agent count", () => {
    const agents = [makeAgent(), makeAgent({ name: "Worker 2" })];
    const { lastFrame } = render(
      <Header state="running" agents={agents} />,
    );
    // "Agents: 2"
    expect(lastFrame()).toContain("Agents");
    expect(lastFrame()).toContain("2");
  });
});

// ─── taskCount / skillCount / memoryCount ─────────────────────────────

describe("Header conditional sections", () => {
  it("shows task count in header", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Header state="running" agents={agents} taskCount={3} />,
    );
    expect(lastFrame()).toContain("Tasks");
    expect(lastFrame()).toContain("3");
  });

  it("hides Skills when skillCount=0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Header state="running" agents={agents} skillCount={0} />,
    );
    expect(lastFrame()).not.toContain("Skills");
  });

  it("shows Skills when skillCount > 0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Header state="running" agents={agents} skillCount={4} />,
    );
    expect(lastFrame()).toContain("Skills");
    expect(lastFrame()).toContain("4");
  });

  it("hides Memory when memoryCount=0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Header state="running" agents={agents} memoryCount={0} />,
    );
    expect(lastFrame()).not.toContain("Memory");
  });

  it("shows Memory when memoryCount > 0", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Header state="running" agents={agents} memoryCount={7} />,
    );
    expect(lastFrame()).toContain("Memory");
    expect(lastFrame()).toContain("7");
  });

  it("shows all sections when all counts are non-zero", () => {
    const agents = [makeAgent()];
    const { lastFrame } = render(
      <Header
        state="running"
        agents={agents}
        taskCount={1}
        skillCount={2}
        memoryCount={3}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("Tasks");
    expect(frame).toContain("Skills");
    expect(frame).toContain("Memory");
  });
});

// ─── modelSummary format ──────────────────────────────────────────────

describe("Header modelSummary format", () => {
  it("wraps summary in parentheses", () => {
    const agents = [makeAgent({ model: "sonnet" })];
    const { lastFrame } = render(
      <Header state="running" agents={agents} />,
    );
    // Should appear as "(1x sonnet)"
    expect(lastFrame()).toContain("(1x sonnet)");
  });

  it("shows no parentheses when agents have no model info", () => {
    // agents array is empty → no modelSummary
    const { lastFrame } = render(
      <Header state="running" agents={[]} />,
    );
    expect(lastFrame()).not.toContain("(");
  });

  it("mixes cli-prefixed and normal models in summary", () => {
    const agents = [
      makeAgent({ model: "sonnet" }),
      makeAgent({ cli: "codex", model: "o3", name: "Codex" }),
    ];
    const { lastFrame } = render(
      <Header state="running" agents={agents} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("1x sonnet");
    expect(frame).toContain("1x codex:o3");
  });
});
