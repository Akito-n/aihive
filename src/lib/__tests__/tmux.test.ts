import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn().mockReturnValue(Buffer.from("")),
}));

vi.mock("node:fs", () => ({
  default: {
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
    existsSync: vi.fn().mockReturnValue(true),
    readFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    readdirSync: vi.fn().mockReturnValue([]),
    copyFileSync: vi.fn(),
  },
}));

// cli-registry calls getInstructionsPath which uses fs — mock it away
vi.mock("../cli-registry.js", () => ({
  buildAgentCommand: vi.fn().mockReturnValue("claude --allowedTools Edit"),
}));

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import type { AihiveConfig } from "../config.js";
import {
  buildAgentList,
  capturePane,
  isShellCommand,
  paneCurrentCommand,
  restartAgent,
  sendKeys,
  sendLiteral,
  sendRawKeys,
  sessionExists,
  startSession,
} from "../tmux.js";

const mockExec = vi.mocked(execFileSync);
/** Each tmux call as one string, e.g. "has-session -t my-session" */
const tmuxCalls = () =>
  mockExec.mock.calls.map((c) => (c[1] as string[]).join(" "));
const mockFsWrite = vi.mocked(fs.writeFileSync);
const mockFsUnlink = vi.mocked(fs.unlinkSync);

function makeConfig(extra: Partial<AihiveConfig> = {}): AihiveConfig {
  return {
    session: "test-session",
    agents: [
      {
        name: "Orchestrator",
        role: "orchestrator",
        cli: "claude",
        model: "opus",
        window: "orchestrator",
      },
    ],
    ...extra,
  };
}

describe("sessionExists", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("returns true when tmux succeeds", () => {
    mockExec.mockReturnValue(Buffer.from(""));
    expect(sessionExists("my-session")).toBe(true);
    expect(mockExec).toHaveBeenCalledWith(
      "tmux",
      ["has-session", "-t", "my-session"],
      { stdio: "ignore" },
    );
  });

  it("returns false when tmux throws", () => {
    mockExec.mockImplementation(() => {
      throw new Error("no session");
    });
    expect(sessionExists("missing")).toBe(false);
  });
});

describe("capturePane", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("returns empty string when session does not exist", () => {
    // has-session throws → sessionExists returns false
    mockExec.mockImplementation(() => {
      throw new Error("no session");
    });
    expect(capturePane("no-session", "orchestrator")).toBe("");
  });

  it("returns empty string when tmux fails during capture", () => {
    let callCount = 0;
    mockExec.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Buffer.from(""); // has-session succeeds
      throw new Error("capture failed"); // capture-pane fails
    });
    expect(capturePane("test-session", "orchestrator")).toBe("");
  });

  it("returns trimmed output when capture succeeds", () => {
    let callCount = 0;
    mockExec.mockImplementation((() => {
      callCount++;
      if (callCount === 1) return Buffer.from(""); // has-session
      return "some output\n\n"; // capture-pane
    }) as unknown as typeof execFileSync);
    expect(capturePane("test-session", "orchestrator")).toBe("some output");
  });
});

describe("sendKeys", () => {
  beforeEach(() => {
    mockExec.mockReset().mockReturnValue(Buffer.from(""));
    mockFsWrite.mockReset();
    mockFsUnlink.mockReset();
  });

  it("calls tmux in correct order: load-buffer → paste-buffer → delete-buffer → send-keys Enter", () => {
    sendKeys("session", "target", "hello");

    const calls = tmuxCalls();
    const lbIdx = calls.findIndex((c) => c.includes("load-buffer"));
    const pbIdx = calls.findIndex((c) => c.includes("paste-buffer"));
    const dbIdx = calls.findIndex((c) => c.includes("delete-buffer"));
    const skIdx = calls.findIndex(
      (c) => c.includes("send-keys") && c.includes("Enter"),
    );

    expect(lbIdx).toBeGreaterThanOrEqual(0);
    expect(pbIdx).toBeGreaterThan(lbIdx);
    expect(dbIdx).toBeGreaterThan(pbIdx);
    expect(skIdx).toBeGreaterThan(dbIdx);
  });

  it("writes text to tmp file before load-buffer", () => {
    sendKeys("session", "target", "my message");
    expect(mockFsWrite).toHaveBeenCalledOnce();
    const [, content] = mockFsWrite.mock.calls[0];
    expect(content).toBe("my message");
  });

  it("always deletes tmp file even when tmux throws (finally block)", () => {
    mockExec.mockImplementation(() => {
      throw new Error("tmux error");
    });
    // Should not throw (error propagates from tmux, but unlinkSync is in finally)
    expect(() => sendKeys("session", "target", "text")).toThrow();
    expect(mockFsUnlink).toHaveBeenCalledOnce();
  });

  it("does not propagate unlinkSync errors", () => {
    mockFsUnlink.mockImplementation(() => {
      throw new Error("unlink failed");
    });
    // sendKeys itself should complete without error
    expect(() => sendKeys("session", "target", "text")).not.toThrow();
  });
});

describe("startSession", () => {
  beforeEach(() => {
    mockExec.mockReset().mockReturnValue(Buffer.from(""));
    mockFsWrite.mockReset();
    mockFsUnlink.mockReset();
  });

  it("kills existing session when sessionExists returns true", () => {
    // First call = has-session succeeds → sessionExists true
    mockExec.mockReturnValue(Buffer.from(""));
    startSession(makeConfig());

    const calls = tmuxCalls();
    expect(calls.some((c) => c.includes("kill-session"))).toBe(true);
  });

  it("does not kill session when session does not exist", () => {
    let callCount = 0;
    mockExec.mockImplementation((_file, args) => {
      callCount++;
      // Only the first call is has-session check; make it throw
      if (callCount === 1 && (args as string[]).includes("has-session")) {
        throw new Error("no session");
      }
      return Buffer.from("");
    });

    startSession(makeConfig());
    const calls = tmuxCalls();
    expect(calls.some((c) => c.includes("kill-session"))).toBe(false);
  });
  it("starts each worker pane in its own workspace directory", () => {
    const config = makeConfig({
      agents: [
        { name: "Coordinator", role: "coordinator", window: "coordinator" },
        { name: "Worker 1", role: "worker", window: "workers", pane: 0 },
        { name: "Worker 2", role: "worker", window: "workers", pane: 1 },
      ],
    });
    const workspaces = new Map([
      ["Worker 1", { cwd: "/wt/worker-1", addDirs: ["/proj"] }],
      ["Worker 2", { cwd: "/wt/worker-2", addDirs: ["/proj"] }],
    ]);

    startSession(config, 100, 40, workspaces);

    const calls = tmuxCalls();
    expect(
      calls.find((c) => c.includes("new-window -t test-session -n workers")),
    ).toContain("-c /wt/worker-1");
    expect(calls.find((c) => c.includes("split-window"))).toContain(
      "-c /wt/worker-2",
    );
    expect(calls.find((c) => c.includes("new-session"))).toContain(
      `-c ${process.cwd()}`,
    );
  });
});

describe("buildAgentList", () => {
  it("converts AgentConfig array to AgentInfo array with status='pending'", () => {
    const config: AihiveConfig = {
      session: "aihive",
      agents: [
        {
          name: "Orchestrator",
          role: "orchestrator",
          cli: "claude",
          model: "opus",
          window: "orchestrator",
        },
        {
          name: "Worker 1",
          role: "worker",
          cli: "claude",
          model: "sonnet",
          window: "workers",
          pane: 0,
        },
      ],
    };
    const agents = buildAgentList(config);
    expect(agents).toHaveLength(2);
    expect(agents[0]).toMatchObject({
      name: "Orchestrator",
      role: "orchestrator",
      status: "pending",
      paneTarget: "orchestrator",
    });
    expect(agents[1]).toMatchObject({
      name: "Worker 1",
      role: "worker",
      status: "pending",
      paneTarget: "workers.0",
    });
  });

  it("sets status='pending' for all agents", () => {
    const config = makeConfig();
    const agents = buildAgentList(config);
    expect(agents.every((a) => a.status === "pending")).toBe(true);
  });
});

describe("sendRawKeys", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("presses the keys with no Enter added", () => {
    sendRawKeys("s", "orchestrator", ["Down"]);
    expect(tmuxCalls()).toEqual(["send-keys -t s:orchestrator Down"]);
  });

  it("sends nothing for no keys", () => {
    sendRawKeys("s", "orchestrator", []);
    expect(mockExec).not.toHaveBeenCalled();
  });
});

describe("sendLiteral", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("types text literally, even text that looks like an option", () => {
    sendLiteral("s", "w.1", "-y");
    expect(mockExec.mock.calls[0][1]).toEqual([
      "send-keys",
      "-t",
      "s:w.1",
      "-l",
      "--",
      "-y",
    ]);
  });
});

describe("paneCurrentCommand", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("returns the pane's foreground program", () => {
    mockExec.mockReturnValueOnce("zsh\n" as never);
    expect(paneCurrentCommand("s", "orchestrator")).toBe("zsh");
    expect(tmuxCalls()[0]).toBe(
      "display-message -p -t s:orchestrator #{pane_current_command}",
    );
  });

  it("is undefined when tmux fails", () => {
    mockExec.mockImplementationOnce(() => {
      throw new Error("no pane");
    });
    expect(paneCurrentCommand("s", "orchestrator")).toBeUndefined();
  });
});

describe("isShellCommand", () => {
  it("knows common shells, also as login shells or paths", () => {
    for (const cmd of ["zsh", "-zsh", "bash", "fish", "/bin/sh"]) {
      expect(isShellCommand(cmd)).toBe(true);
    }
  });

  it("does not count agent CLIs or nothing", () => {
    for (const cmd of ["claude", "node", "codex", "gemini", "", undefined]) {
      expect(isShellCommand(cmd)).toBe(false);
    }
  });
});

describe("restartAgent", () => {
  beforeEach(() => {
    mockExec.mockReset();
  });

  it("types the agent's command into its pane and presses Enter", () => {
    restartAgent("s", "orchestrator", makeConfig().agents[0]);
    const calls = tmuxCalls();
    expect(calls).toContain(
      "paste-buffer -p -b _aihive_paste -t s:orchestrator",
    );
    expect(calls.at(-1)).toBe("send-keys -t s:orchestrator Enter");
  });
});
