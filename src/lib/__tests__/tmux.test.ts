import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn().mockReturnValue(Buffer.from("")),
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

import { execSync } from "node:child_process";
import fs from "node:fs";
import {
  buildAgentList,
  capturePane,
  sendKeys,
  sessionExists,
  startSession,
} from "../tmux.js";
import type { AihiveConfig } from "../config.js";

const mockExecSync = vi.mocked(execSync);
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
    mockExecSync.mockReset();
  });

  it("returns true when execSync succeeds", () => {
    mockExecSync.mockReturnValue(Buffer.from(""));
    expect(sessionExists("my-session")).toBe(true);
    expect(mockExecSync).toHaveBeenCalledWith(
      "tmux has-session -t my-session",
      { stdio: "ignore" },
    );
  });

  it("returns false when execSync throws", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("no session");
    });
    expect(sessionExists("missing")).toBe(false);
  });
});

describe("capturePane", () => {
  beforeEach(() => {
    mockExecSync.mockReset();
  });

  it("returns empty string when session does not exist", () => {
    // has-session throws → sessionExists returns false
    mockExecSync.mockImplementation(() => {
      throw new Error("no session");
    });
    expect(capturePane("no-session", "orchestrator")).toBe("");
  });

  it("returns empty string when execSync fails during capture", () => {
    let callCount = 0;
    mockExecSync.mockImplementation(() => {
      callCount++;
      if (callCount === 1) return Buffer.from(""); // has-session succeeds
      throw new Error("capture failed"); // capture-pane fails
    });
    expect(capturePane("test-session", "orchestrator")).toBe("");
  });

  it("returns trimmed output when capture succeeds", () => {
    let callCount = 0;
    mockExecSync.mockImplementation(((_cmd: string) => {
      callCount++;
      if (callCount === 1) return Buffer.from(""); // has-session
      return "some output\n\n"; // capture-pane
    }) as unknown as typeof execSync);
    expect(capturePane("test-session", "orchestrator")).toBe("some output");
  });
});

describe("sendKeys", () => {
  beforeEach(() => {
    mockExecSync.mockReset().mockReturnValue(Buffer.from(""));
    mockFsWrite.mockReset();
    mockFsUnlink.mockReset();
  });

  it("calls execSync in correct order: load-buffer → paste-buffer → delete-buffer → send-keys Enter", () => {
    sendKeys("session", "target", "hello");

    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    const lbIdx = calls.findIndex((c) => c.includes("load-buffer"));
    const pbIdx = calls.findIndex((c) => c.includes("paste-buffer"));
    const dbIdx = calls.findIndex((c) => c.includes("delete-buffer"));
    const skIdx = calls.findIndex((c) => c.includes("send-keys") && c.includes("Enter"));

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

  it("always deletes tmp file even when execSync throws (finally block)", () => {
    mockExecSync.mockImplementation(() => {
      throw new Error("tmux error");
    });
    // Should not throw (error propagates from execSync, but unlinkSync is in finally)
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
    mockExecSync.mockReset().mockReturnValue(Buffer.from(""));
    mockFsWrite.mockReset();
    mockFsUnlink.mockReset();
  });

  it("kills existing session when sessionExists returns true", () => {
    // First call = has-session succeeds → sessionExists true
    mockExecSync.mockReturnValue(Buffer.from(""));
    startSession(makeConfig());

    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("kill-session"))).toBe(true);
  });

  it("does not kill session when session does not exist", () => {
    let callCount = 0;
    mockExecSync.mockImplementation((cmd) => {
      callCount++;
      // Only the first call is has-session check; make it throw
      if (callCount === 1 && (cmd as string).includes("has-session")) {
        throw new Error("no session");
      }
      return Buffer.from("");
    });

    startSession(makeConfig());
    const calls = mockExecSync.mock.calls.map((c) => c[0] as string);
    expect(calls.some((c) => c.includes("kill-session"))).toBe(false);
  });
});

describe("buildAgentList", () => {
  it("converts AgentConfig array to AgentInfo array with status='pending'", () => {
    const config: AihiveConfig = {
      session: "aihive",
      agents: [
        { name: "Orchestrator", role: "orchestrator", cli: "claude", model: "opus", window: "orchestrator" },
        { name: "Worker 1", role: "worker", cli: "claude", model: "sonnet", window: "workers", pane: 0 },
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
