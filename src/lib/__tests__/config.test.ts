import { beforeEach, describe, expect, it, vi } from "vitest";
import { parse } from "yaml";

vi.mock("node:fs", () => ({
  default: {
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    copyFileSync: vi.fn(),
  },
}));

import fs from "node:fs";
import {
  defaultModelForRole,
  getPaneTarget,
  loadConfig,
  resolveWindowLayout,
  saveConfig,
} from "../config.js";
import type { AgentConfig } from "../config.js";

function makeAgent(
  overrides: Partial<AgentConfig> & { role: string; name: string },
): AgentConfig {
  return { window: "", cli: "claude", model: "sonnet", ...overrides };
}

describe("resolveWindowLayout", () => {
  it("solo roles get their own window with pane=undefined", () => {
    for (const role of ["orchestrator", "coordinator", "reviewer", "scout"]) {
      const [a] = resolveWindowLayout([makeAgent({ name: role, role })]);
      expect(a.window).toBe(role);
      expect(a.pane).toBeUndefined();
    }
  });

  it("multiple workers share 'workers' window with sequential pane indices", () => {
    const agents = resolveWindowLayout([
      makeAgent({ name: "W1", role: "worker" }),
      makeAgent({ name: "W2", role: "worker" }),
      makeAgent({ name: "W3", role: "worker" }),
    ]);
    expect(agents[0]).toMatchObject({ window: "workers", pane: 0 });
    expect(agents[1]).toMatchObject({ window: "workers", pane: 1 });
    expect(agents[2]).toMatchObject({ window: "workers", pane: 2 });
  });

  it("single worker gets pane=undefined", () => {
    const [a] = resolveWindowLayout([makeAgent({ name: "W1", role: "worker" })]);
    expect(a.window).toBe("workers");
    expect(a.pane).toBeUndefined();
  });

  it("multiple custom roles are grouped by role name with sequential pane indices", () => {
    const agents = resolveWindowLayout([
      makeAgent({ name: "C1", role: "coder" }),
      makeAgent({ name: "C2", role: "coder" }),
    ]);
    expect(agents[0]).toMatchObject({ window: "coder", pane: 0 });
    expect(agents[1]).toMatchObject({ window: "coder", pane: 1 });
  });

  it("single custom role agent gets pane=undefined", () => {
    const [a] = resolveWindowLayout([
      makeAgent({ name: "C1", role: "coder" }),
    ]);
    expect(a.window).toBe("coder");
    expect(a.pane).toBeUndefined();
  });
});

describe("defaultModelForRole", () => {
  it("returns 'opus' for orchestrator and scout", () => {
    expect(defaultModelForRole("orchestrator")).toBe("opus");
    expect(defaultModelForRole("scout")).toBe("opus");
  });

  it("returns 'sonnet' for coordinator, worker, reviewer, and any other role", () => {
    expect(defaultModelForRole("coordinator")).toBe("sonnet");
    expect(defaultModelForRole("worker")).toBe("sonnet");
    expect(defaultModelForRole("reviewer")).toBe("sonnet");
    expect(defaultModelForRole("custom")).toBe("sonnet");
  });
});

describe("getPaneTarget", () => {
  it("returns 'windowName.pane' when pane is set", () => {
    const agent = makeAgent({ name: "W", role: "worker", window: "workers", pane: 2 });
    expect(getPaneTarget(agent)).toBe("workers.2");
  });

  it("returns 'windowName' when pane is undefined", () => {
    const agent = makeAgent({ name: "O", role: "orchestrator", window: "orchestrator" });
    expect(getPaneTarget(agent)).toBe("orchestrator");
  });

  it("returns 'windowName' when pane is null-ish (pane=0 still includes pane)", () => {
    const agent = makeAgent({ name: "W", role: "worker", window: "workers", pane: 0 });
    expect(getPaneTarget(agent)).toBe("workers.0");
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockReset();
  });

  it("returns defaultConfig when YAML is empty (parse returns null)", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("");
    const config = loadConfig();
    expect(config.session).toBe("aihive");
    expect(config.agents.length).toBeGreaterThan(0);
  });

  it("returns defaultConfig when agents array is empty", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("session: aihive\nagents: []");
    const config = loadConfig();
    expect(config.session).toBe("aihive");
    expect(config.agents.length).toBeGreaterThan(0);
  });

  it("fills in cli='claude' when cli is not specified", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      "session: aihive\nagents:\n  - name: Worker 1\n    role: worker\n",
    );
    const config = loadConfig();
    expect(config.agents[0].cli).toBe("claude");
  });

  it("fills in model from defaultModelForRole when model is not specified", () => {
    vi.mocked(fs.readFileSync).mockReturnValue(
      "session: aihive\nagents:\n  - name: Orchestrator\n    role: orchestrator\n  - name: Worker\n    role: worker\n",
    );
    const config = loadConfig();
    const orch = config.agents.find((a) => a.role === "orchestrator");
    const worker = config.agents.find((a) => a.role === "worker");
    expect(orch?.model).toBe("opus");
    expect(worker?.model).toBe("sonnet");
  });
});

describe("saveConfig", () => {
  beforeEach(() => {
    vi.mocked(fs.existsSync).mockReturnValue(true);
    vi.mocked(fs.writeFileSync).mockReset();
  });

  it("omits the cli field when cli is 'claude'", () => {
    saveConfig({
      session: "aihive",
      agents: [
        makeAgent({ name: "W", role: "worker", window: "workers", cli: "claude", model: "sonnet" }),
      ],
    });
    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    const parsed = parse(written) as { agents: { cli?: string }[] };
    expect(parsed.agents[0].cli).toBeUndefined();
  });

  it("includes the cli field when cli is not 'claude'", () => {
    saveConfig({
      session: "aihive",
      agents: [
        makeAgent({ name: "W", role: "worker", window: "workers", cli: "codex", model: "o3" }),
      ],
    });
    const written = vi.mocked(fs.writeFileSync).mock.calls[0][1] as string;
    const parsed = parse(written) as { agents: { cli?: string }[] };
    expect(parsed.agents[0].cli).toBe("codex");
  });
});
