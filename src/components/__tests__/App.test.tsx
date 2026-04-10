import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── vi.hoisted: define variables usable inside vi.mock factories ─────────────
const mocks = vi.hoisted(() => {
  const capturedMsgHandlerRef: { value: ((msg: unknown) => void) | null } = {
    value: null,
  };

  // TaskManager instance methods
  const tmOnChange = vi.fn();
  const tmHandleMessage = vi.fn();
  const tmGetAll = vi.fn().mockReturnValue([]);
  const tmClear = vi.fn();

  // SkillManager instance methods
  const smInit = vi.fn();
  const smPropose = vi.fn();
  const smApprove = vi.fn().mockReturnValue(false);
  const smReject = vi.fn().mockReturnValue(false);
  const smGetCounts = vi
    .fn()
    .mockReturnValue({ proposed: 0, approved: 0, rejected: 0 });

  // MemoryManager instance methods
  const mmInit = vi.fn();
  const mmWrite = vi.fn();
  const mmSearch = vi.fn().mockReturnValue([]);
  const mmGetCount = vi.fn().mockReturnValue(0);

  // MessageBus mock
  const busOnMessage = vi.fn((h: (msg: unknown) => void) => {
    capturedMsgHandlerRef.value = h;
  });
  const busStartWatching = vi.fn();
  const busStopWatching = vi.fn();
  const busSetNudgeConfig = vi.fn();
  const busSend = vi.fn();
  const mockBus = {
    onMessage: busOnMessage,
    startWatching: busStartWatching,
    stopWatching: busStopWatching,
    setNudgeConfig: busSetNudgeConfig,
    send: busSend,
  };

  const initWorkspaceMock = vi.fn().mockReturnValue(mockBus);
  const sessionExistsMock = vi.fn().mockReturnValue(false);

  return {
    capturedMsgHandlerRef,
    tmOnChange,
    tmHandleMessage,
    tmGetAll,
    tmClear,
    smInit,
    smPropose,
    smApprove,
    smReject,
    smGetCounts,
    mmInit,
    mmWrite,
    mmSearch,
    mmGetCount,
    mockBus,
    initWorkspaceMock,
    sessionExistsMock,
  };
});

// ─── vi.mock factories ────────────────────────────────────────────────────────

vi.mock("../../lib/config.js", () => ({
  loadConfig: vi.fn().mockReturnValue({
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
  }),
  saveConfig: vi.fn(),
  getPaneTarget: vi.fn().mockReturnValue("orchestrator"),
}));

vi.mock("../../lib/tmux.js", () => ({
  sessionExists: mocks.sessionExistsMock,
  buildAgentList: vi.fn().mockReturnValue([
    {
      name: "Orchestrator",
      role: "orchestrator",
      status: "pending",
      paneTarget: "orchestrator",
    },
  ]),
  startSession: vi.fn(),
  stopSession: vi.fn(),
  sendToPane: vi.fn(),
  capturePane: vi.fn().mockReturnValue(""),
}));

vi.mock("../../lib/workspace.js", () => ({
  initWorkspace: mocks.initWorkspaceMock,
}));

vi.mock("../../lib/tasks.js", () => ({
  TaskManager: vi.fn(function (this: Record<string, unknown>) {
    this.onChange = mocks.tmOnChange;
    this.handleMessage = mocks.tmHandleMessage;
    this.getAll = mocks.tmGetAll;
    this.clear = mocks.tmClear;
  }),
}));

vi.mock("../../lib/skills.js", () => ({
  SkillManager: vi.fn(function (this: Record<string, unknown>) {
    this.init = mocks.smInit;
    this.propose = mocks.smPropose;
    this.approve = mocks.smApprove;
    this.reject = mocks.smReject;
    this.getCounts = mocks.smGetCounts;
  }),
}));

vi.mock("../../lib/memory.js", () => ({
  MemoryManager: vi.fn(function (this: Record<string, unknown>) {
    this.init = mocks.mmInit;
    this.write = mocks.mmWrite;
    this.search = mocks.mmSearch;
    this.getCount = mocks.mmGetCount;
  }),
}));

vi.mock("../../lib/commands.js", () => ({
  loadSlashCommands: vi.fn().mockReturnValue([]),
}));

vi.mock("../../lib/quick-commands.js", () => ({
  loadQuickCommands: vi.fn().mockReturnValue([]),
  groupByCategory: vi.fn().mockReturnValue({}),
}));

// Sub-component mocks: MainMenu and StartupScreen store callbacks in globalThis
// so tests can trigger state transitions without Ink key input
vi.mock("../MainMenu.js", async () => {
  const { createElement } = await import("react");
  const { Text } = await import("ink");
  return {
    MainMenu: ({
      onSelect,
    }: {
      onSelect: (key: string) => void;
      agents: number;
      roleCounts: Record<string, number>;
    }) => {
      (globalThis as Record<string, unknown>).__menuOnSelect = onSelect;
      return createElement(Text, null, "MAINMENU");
    },
  };
});

vi.mock("../StartupScreen.js", async () => {
  const { createElement } = await import("react");
  const { Text } = await import("ink");
  return {
    StartupScreen: ({ onComplete }: { onComplete: () => void }) => {
      (globalThis as Record<string, unknown>).__startupOnComplete = onComplete;
      return createElement(Text, null, "STARTUP");
    },
  };
});

vi.mock("../Dashboard.js", () => ({ Dashboard: () => null }));
vi.mock("../Header.js", () => ({ Header: () => null }));
vi.mock("../HelpBar.js", () => ({ HelpBar: () => null }));
vi.mock("../LogView.js", () => ({ LogView: () => null }));
vi.mock("../OverviewMode.js", () => ({ OverviewMode: () => null }));
vi.mock("../PaneView.js", () => ({ PaneView: () => null }));
vi.mock("../QuickCommandMenu.js", () => ({ QuickCommandMenu: () => null }));
vi.mock("../SettingsScreen.js", () => ({ SettingsScreen: () => null }));
vi.mock("../CommandInput.js", () => ({ CommandInput: () => null }));

// ─── Imports (after vi.mock) ──────────────────────────────────────────────────
import { render } from "ink-testing-library";
import { App } from "../App.js";

// ─── Test helpers ─────────────────────────────────────────────────────────────
type Msg = {
  id: string;
  from: string;
  to: string;
  type: string;
  payload: string;
  timestamp: string;
};
function makeMsg(overrides: Partial<Msg> & { type: string }): Msg {
  return {
    id: "test-id",
    from: "worker-1",
    to: "coordinator",
    payload: "test payload",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

async function advanceToRunningState() {
  mocks.capturedMsgHandlerRef.value = null;

  render(<App />);

  // Flush initial render
  await act(async () => {
    await Promise.resolve();
  });

  // Trigger "start" → idle → starting
  const onSelect = (globalThis as Record<string, unknown>).__menuOnSelect as
    | ((k: string) => void)
    | undefined;
  await act(async () => {
    onSelect?.("start");
    await Promise.resolve();
  });

  // Trigger onComplete → starting → running
  const onComplete = (globalThis as Record<string, unknown>)
    .__startupOnComplete as (() => void) | undefined;
  await act(async () => {
    onComplete?.();
    await Promise.resolve();
  });

  // Flush useEffect for bus.onMessage registration
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("App - initial state", () => {
  afterEach(() => {
    mocks.sessionExistsMock.mockReturnValue(false);
  });

  it("starts in idle state (shows MainMenu) when sessionExists=false", async () => {
    mocks.sessionExistsMock.mockReturnValue(false);
    const { lastFrame } = render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(lastFrame()).toContain("MAINMENU");
  });

  it("starts in running state (no MainMenu, no StartupScreen) when sessionExists=true", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    const { lastFrame } = render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(lastFrame()).not.toContain("MAINMENU");
    expect(lastFrame()).not.toContain("STARTUP");
  });
});

describe("App - message handlers", () => {
  beforeEach(async () => {
    mocks.sessionExistsMock.mockReturnValue(false);
    mocks.tmHandleMessage.mockReset();
    mocks.smPropose.mockReset();
    mocks.mmWrite.mockReset();
    mocks.mockBus.onMessage
      .mockReset()
      .mockImplementation((h: (msg: unknown) => void) => {
        mocks.capturedMsgHandlerRef.value = h;
      });
    await advanceToRunningState();
  });

  it("registers onMessage handler after reaching running state", () => {
    expect(mocks.capturedMsgHandlerRef.value).not.toBeNull();
  });

  it("type='result' → TaskManager.handleMessage() is called", () => {
    const msg = makeMsg({ type: "result", from: "worker-1" });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.tmHandleMessage).toHaveBeenCalledWith(msg);
  });

  it("type='error' → TaskManager.handleMessage() is called", () => {
    const msg = makeMsg({ type: "error", from: "worker-1" });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.tmHandleMessage).toHaveBeenCalledWith(msg);
  });

  it("type='task' → TaskManager.handleMessage() is called", () => {
    const msg = makeMsg({ type: "task", from: "coordinator", to: "worker-1" });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.tmHandleMessage).toHaveBeenCalledWith(msg);
  });

  it("type='skill-proposal' with valid JSON → SkillManager.propose() is called", () => {
    const skillData = {
      id: "skill-1",
      name: "Test Skill",
      description: "desc",
      trigger: "when",
      steps: [],
      created_by: "worker-1",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const msg = makeMsg({
      type: "skill-proposal",
      payload: JSON.stringify(skillData),
    });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.smPropose).toHaveBeenCalledWith(skillData);
  });

  it("type='skill-proposal' with invalid JSON → does not throw (error swallowed)", () => {
    const msg = makeMsg({
      type: "skill-proposal",
      payload: "{ invalid json }}}",
    });
    expect(() => mocks.capturedMsgHandlerRef.value?.(msg)).not.toThrow();
    expect(mocks.smPropose).not.toHaveBeenCalled();
  });

  it("type='memory-write' with valid JSON → MemoryManager.write() is called", () => {
    const entry = { key: "test-key", value: "test-value" };
    const msg = makeMsg({
      type: "memory-write",
      from: "worker-1",
      payload: JSON.stringify(entry),
    });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.mmWrite).toHaveBeenCalled();
    const written = mocks.mmWrite.mock.calls[0][0];
    expect(written.key).toBe("test-key");
    expect(written.created_by).toBe("worker-1");
  });

  it("type='memory-write' with invalid JSON → does not throw (error swallowed)", () => {
    const msg = makeMsg({
      type: "memory-write",
      payload: "{ bad json",
    });
    expect(() => mocks.capturedMsgHandlerRef.value?.(msg)).not.toThrow();
    expect(mocks.mmWrite).not.toHaveBeenCalled();
  });
});
