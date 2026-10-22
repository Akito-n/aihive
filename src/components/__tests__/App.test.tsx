import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ─── vi.hoisted: define variables usable inside vi.mock factories ─────────────
const mocks = vi.hoisted(() => {
  const capturedMsgHandlerRef: { value: ((msg: unknown) => void) | null } = {
    value: null,
  };

  // TaskManager instance methods
  const tmOnChange = vi.fn(() => vi.fn());
  const tmHandleMessage = vi.fn();
  const tmGetAll = vi.fn().mockReturnValue([]);
  const tmClear = vi.fn();
  const tmRestore = vi.fn();
  const checkRun = vi.fn(() => Promise.resolve());
  const checkRunnerArgs: { value: unknown[] | null } = { value: null };
  const stallCheck = vi.fn(() => ({
    stalled: [] as unknown[],
    toRemind: [] as unknown[],
  }));
  const loadTasksMock = vi.fn().mockReturnValue([]);
  const notifyMock = vi.fn();
  const reportPrime = vi.fn();
  const reportDue = vi.fn().mockReturnValue(false);
  const formatReportMock = vi.fn().mockReturnValue("REPORT MD");
  const writeReportMock = vi.fn().mockReturnValue("/proj/.aihive/reports/x.md");
  const saveTasksMock = vi.fn();
  const awardTaskMock = vi.fn();
  const recordSkillUsesMock = vi.fn();
  const findSkillUsesMock = vi.fn().mockReturnValue([]);

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
  const busUnsubscribe = vi.fn();
  const busOnMessage = vi.fn((h: (msg: unknown) => void) => {
    capturedMsgHandlerRef.value = h;
    return busUnsubscribe;
  });
  const busStartWatching = vi.fn();
  const busStopWatching = vi.fn();
  const busSetNudgeConfig = vi.fn();
  const busSend = vi.fn();
  const busRemindStalled = vi.fn().mockResolvedValue(true);
  const mockBus = {
    remindStalled: busRemindStalled,
    onMessage: busOnMessage,
    startWatching: busStartWatching,
    stopWatching: busStopWatching,
    setNudgeConfig: busSetNudgeConfig,
    send: busSend,
  };

  const initWorkspaceMock = vi.fn().mockReturnValue(mockBus);
  const sessionExistsMock = vi.fn().mockReturnValue(false);
  const paneCommandMock = vi.fn().mockReturnValue("claude");
  const restartAgentMock = vi.fn();
  const sendRawKeysMock = vi.fn();
  const sendLiteralMock = vi.fn();
  // Never touch the real ~/.claude.json from tests
  const untrustedDirsMock = vi.fn().mockReturnValue([]);
  const trustDirsMock = vi.fn();

  return {
    capturedMsgHandlerRef,
    tmOnChange,
    tmHandleMessage,
    tmGetAll,
    tmClear,
    tmRestore,
    stallCheck,
    checkRun,
    checkRunnerArgs,
    loadTasksMock,
    saveTasksMock,
    awardTaskMock,
    recordSkillUsesMock,
    findSkillUsesMock,
    notifyMock,
    reportPrime,
    reportDue,
    formatReportMock,
    writeReportMock,
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
    busUnsubscribe,
    initWorkspaceMock,
    sessionExistsMock,
    paneCommandMock,
    restartAgentMock,
    sendRawKeysMock,
    sendLiteralMock,
    untrustedDirsMock,
    trustDirsMock,
  };
});

vi.mock("../../lib/claude-trust.js", () => ({
  claudeAgentDirs: () => ["/proj"],
  untrustedDirs: mocks.untrustedDirsMock,
  trustDirs: mocks.trustDirsMock,
}));

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
  initInstructions: vi
    .fn()
    .mockReturnValue({ installed: [], updated: [], kept: [] }),
  getPaneTarget: vi.fn().mockReturnValue("orchestrator"),
  stallMinutesOf: () => 15,
  notifyModeOf: () => "bell",
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
  paneCurrentCommand: mocks.paneCommandMock,
  isShellCommand: (command?: string) => command === "zsh",
  restartAgent: mocks.restartAgentMock,
  sendRawKeys: mocks.sendRawKeysMock,
  sendLiteral: mocks.sendLiteralMock,
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
    this.restore = mocks.tmRestore;
  }),
  StallMonitor: vi.fn(function (this: Record<string, unknown>) {
    this.check = mocks.stallCheck;
  }),
  taskIdOf: (m: { payload?: string }) =>
    /task_id:\s*(\S+)/.exec(m.payload ?? "")?.[1],
  tasksFilePath: () => "/proj/.aihive/tasks.json",
  loadTasks: mocks.loadTasksMock,
  saveTasks: mocks.saveTasksMock,
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

vi.mock("../../lib/memory.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../../lib/memory.js")>()),
  MemoryManager: vi.fn(function (this: Record<string, unknown>) {
    this.init = mocks.mmInit;
    this.write = mocks.mmWrite;
    this.search = mocks.mmSearch;
    this.getCount = mocks.mmGetCount;
  }),
}));

vi.mock("../../lib/worktrees.js", () => ({
  prepareWorkspaces: vi.fn().mockReturnValue({
    workspaces: new Map(),
    messages: [],
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

vi.mock("../Dashboard.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../Dashboard.js")>()),
  Dashboard: (props: { agents: unknown }) => {
    (globalThis as Record<string, unknown>).__dashboardAgents = props.agents;
    return null;
  },
}));
vi.mock("../Header.js", () => ({ Header: () => null }));
vi.mock("../HelpBar.js", () => ({
  HelpBar: (props: { message?: { text: string } }) => {
    (globalThis as Record<string, unknown>).__helpBarMessage =
      props.message?.text;
    return null;
  },
}));
vi.mock("../LogView.js", () => ({
  LogView: (props: { logs: string[]; onClose?: () => void }) => {
    (globalThis as Record<string, unknown>).__logViewProps = props;
    return null;
  },
}));
vi.mock("../OverviewMode.js", () => ({ OverviewMode: () => null }));
vi.mock("../PaneView.js", () => ({ PaneView: () => null }));
vi.mock("../QuickCommandMenu.js", () => ({ QuickCommandMenu: () => null }));
vi.mock("../SettingsScreen.js", () => ({ SettingsScreen: () => null }));
vi.mock("../CommandInput.js", () => ({ CommandInput: () => null }));
vi.mock("../TaskView.js", () => ({
  TaskView: (props: { tasks: unknown; onClose: () => void }) => {
    (globalThis as Record<string, unknown>).__taskViewProps = props;
    return null;
  },
}));

vi.mock("../../lib/notify.js", () => ({ notify: mocks.notifyMock }));

// Never touch the real ~/.aihive/progress.json from tests
vi.mock("../../lib/progress.js", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("../../lib/progress.js")>();
  return {
    ...original,
    loadProgress: () => original.emptyProgress(),
    awardTask: mocks.awardTaskMock,
    recordSkillUses: mocks.recordSkillUsesMock,
    equipItem: () => original.emptyProgress(),
    setLooks: () => original.emptyProgress(),
  };
});

vi.mock("../../lib/skill-usage.js", () => ({
  findSkillUses: mocks.findSkillUsesMock,
}));

vi.mock("../../lib/report.js", () => ({
  CompletionReporter: vi.fn(function (this: Record<string, unknown>) {
    this.prime = mocks.reportPrime;
    this.due = mocks.reportDue;
  }),
  formatReport: mocks.formatReportMock,
  writeReport: mocks.writeReportMock,
}));

vi.mock("../../lib/checks.js", () => ({
  CheckRunner: vi.fn(function (
    this: Record<string, unknown>,
    ...args: unknown[]
  ) {
    mocks.checkRunnerArgs.value = args;
    this.run = mocks.checkRun;
  }),
}));

// ─── Imports (after vi.mock) ──────────────────────────────────────────────────
import { render } from "ink-testing-library";
import { loadConfig } from "../../lib/config.js";
import { emptyProgress } from "../../lib/progress.js";
import { startSession } from "../../lib/tmux.js";
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

  const instance = render(<App />);

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

  return instance;
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

  it("reattaches the mailbox without wiping it when sessionExists=true", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    mocks.initWorkspaceMock.mockClear();
    mocks.mockBus.onMessage.mockClear();
    mocks.mockBus.startWatching.mockClear();
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.initWorkspaceMock).toHaveBeenCalledWith(expect.anything(), {
      reset: false,
    });
    expect(mocks.mockBus.onMessage).toHaveBeenCalledTimes(1);
    expect(mocks.mockBus.startWatching).toHaveBeenCalledTimes(1);
  });

  it("restores the saved task list when reattaching", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    const saved = [{ id: "T1" }];
    mocks.loadTasksMock.mockReturnValueOnce(saved);
    mocks.tmRestore.mockClear();
    mocks.tmClear.mockClear();
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.tmRestore).toHaveBeenCalledWith(saved);
    expect(mocks.tmClear).not.toHaveBeenCalled();
  });

  it("saves the task list whenever a task changes", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    mocks.saveTasksMock.mockClear();
    mocks.tmOnChange.mockClear();
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    const onChange = (
      mocks.tmOnChange.mock.calls[0] as unknown as [(t: unknown) => void]
    )[0];
    act(() => onChange({ id: "T1", state: "done", blockedBy: [] }));
    expect(mocks.saveTasksMock).toHaveBeenCalledWith(
      "/proj/.aihive/tasks.json",
      expect.any(Array),
    );
  });

  it("tells the story in the message window: quests, then the reward once per task", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    mocks.tmOnChange.mockClear();
    mocks.awardTaskMock.mockReset();
    mocks.awardTaskMock.mockReturnValue({
      xp: 35,
      member: "worker-1",
      memberLevel: { before: 1, after: 2 },
      partyLevel: { before: 1, after: 1 },
      boss: false,
      skills: { str: 1, vit: 0, agi: 2, int: 1 },
      events: [],
      drops: [],
      gold: 0,
      titles: [],
      progress: { ...emptyProgress(), partyXp: 35 },
    });
    const g = globalThis as Record<string, unknown>;
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    act(() =>
      mocks.capturedMsgHandlerRef.value?.({
        type: "task",
        from: "coordinator",
        to: "worker-1",
        payload: "task_id: T1\nbuild it",
      }),
    );
    expect(g.__helpBarMessage).toContain("T1");
    const onChange = (
      mocks.tmOnChange.mock.calls[0] as unknown as [(t: unknown) => void]
    )[0];
    const done = {
      id: "T1",
      state: "done",
      assignedTo: "worker-1",
      blockedBy: [],
    };
    mocks.tmGetAll.mockReturnValue([done]);
    act(() => onChange(done));
    expect(mocks.awardTaskMock).toHaveBeenCalledTimes(1);
    expect(mocks.awardTaskMock.mock.calls[0][0]).toMatchObject({
      task: done,
      member: { name: "worker-1", role: "worker" },
      checksPassed: false,
      stalled: false,
    });
    expect(g.__helpBarMessage).toMatch(/レベル|level/);
    mocks.tmGetAll.mockReturnValue([{ ...done }]);
    act(() => onChange(done));
    expect(mocks.awardTaskMock).toHaveBeenCalledTimes(1);
    mocks.tmGetAll.mockReturnValue([]);
  });

  it("counts the agents' skill uses as special moves when a task finishes", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    mocks.tmOnChange.mockClear();
    mocks.awardTaskMock.mockReset();
    mocks.awardTaskMock.mockReturnValue({
      xp: 35,
      member: "worker-1",
      memberLevel: { before: 1, after: 1 },
      partyLevel: { before: 1, after: 1 },
      boss: false,
      skills: { str: 1, vit: 0, agi: 2, int: 1 },
      events: [],
      drops: [],
      gold: 0,
      titles: [],
      progress: emptyProgress(),
    });
    mocks.findSkillUsesMock.mockReturnValue([{ id: "u1", skill: "review" }]);
    mocks.recordSkillUsesMock.mockReturnValue({
      learned: ["review"],
      leveledUp: [],
      titles: [],
      progress: { ...emptyProgress(), moves: { review: 1 } },
    });
    const g = globalThis as Record<string, unknown>;
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    const onChange = (
      mocks.tmOnChange.mock.calls[0] as unknown as [(t: unknown) => void]
    )[0];
    const done = {
      id: "T9",
      state: "done",
      assignedTo: "worker-1",
      blockedBy: [],
    };
    mocks.tmGetAll.mockReturnValue([done]);
    act(() => onChange(done));
    expect(mocks.recordSkillUsesMock).toHaveBeenCalledWith([
      { id: "u1", skill: "review" },
    ]);
    expect(g.__helpBarMessage).toContain("review");
    mocks.findSkillUsesMock.mockReturnValue([]);
    mocks.recordSkillUsesMock.mockReset();
    mocks.tmGetAll.mockReturnValue([]);
  });

  it("S opens the status screen with the party's record, and it can close", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    const { stdin, lastFrame } = render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      stdin.write("S");
    });
    expect(lastFrame()).toMatch(/つよさ|Status/);
    await act(async () => {
      stdin.write("\u001B");
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(lastFrame()).not.toMatch(/つよさ|Status/);
  });

  it("reminds the assignee of a stalled task once a minute check finds it", async () => {
    mocks.notifyMock.mockClear();
    mocks.sessionExistsMock.mockReturnValue(true);
    mocks.mockBus.remindStalled.mockClear();
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    const tick = intervalSpy.mock.calls.find((c) => c[1] === 60_000)?.[0] as
      | (() => void)
      | undefined;
    intervalSpy.mockRestore();
    expect(tick).toBeDefined();

    const stalled = { id: "T1-2", assignedTo: "Worker 1", state: "pending" };
    mocks.stallCheck.mockReturnValueOnce({
      stalled: [stalled],
      toRemind: [stalled],
    });
    act(() => tick?.());
    expect(mocks.mockBus.remindStalled).toHaveBeenCalledWith(
      "worker-1",
      "T1-2",
      15,
    );
    expect(mocks.notifyMock).toHaveBeenCalledWith(
      "bell",
      "aihive",
      expect.stringContaining("T1-2"),
    );
  });

  it("runs the configured checks when a worker reports, and sends the outcome to the reviewer", async () => {
    mocks.notifyMock.mockClear();
    mocks.sessionExistsMock.mockReturnValue(true);
    mocks.checkRun.mockClear();
    mocks.mockBus.send.mockClear();
    mocks.mockBus.onMessage.mockImplementation((h: (msg: unknown) => void) => {
      mocks.capturedMsgHandlerRef.value = h;
      return mocks.busUnsubscribe;
    });
    vi.mocked(loadConfig).mockReturnValueOnce({
      session: "test-session",
      checks: ["npm test"],
      agents: [
        { name: "Worker 1", role: "worker", window: "workers", pane: 0 },
        { name: "Reviewer", role: "reviewer", window: "reviewer" },
      ],
    });
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });

    act(() =>
      mocks.capturedMsgHandlerRef.value?.(
        makeMsg({
          type: "result",
          from: "worker-1",
          payload: "task_id: T1-2\ndone",
        }),
      ),
    );
    expect(mocks.checkRun).toHaveBeenCalledWith("Worker 1", "T1-2");

    // A result from a non-worker does not start checks
    mocks.checkRun.mockClear();
    act(() =>
      mocks.capturedMsgHandlerRef.value?.(
        makeMsg({ type: "result", from: "reviewer" }),
      ),
    );
    expect(mocks.checkRun).not.toHaveBeenCalled();

    const onDone = mocks.checkRunnerArgs.value?.[2] as (r: unknown) => void;
    act(() =>
      onDone({
        worker: "Worker 1",
        taskId: "T1-2",
        result: {
          passed: false,
          failedCommand: "npm test",
          runs: [],
          outputTail: "",
        },
        payload: "REPORT",
      }),
    );
    expect(mocks.mockBus.send).toHaveBeenCalledWith(
      "system",
      "reviewer",
      "check-result",
      "REPORT",
    );
    expect(mocks.notifyMock).toHaveBeenCalledWith(
      "bell",
      "aihive",
      expect.stringContaining("npm test"),
    );
  });

  it("writes a completion report with the check results once every task has finished", async () => {
    mocks.notifyMock.mockClear();
    mocks.sessionExistsMock.mockReturnValue(true);
    mocks.reportPrime.mockClear();
    mocks.formatReportMock.mockClear();
    mocks.writeReportMock.mockClear();
    vi.mocked(loadConfig).mockReturnValueOnce({
      session: "test-session",
      checks: ["npm test"],
      agents: [{ name: "Worker 1", role: "worker", window: "workers" }],
    });
    const intervalSpy = vi.spyOn(globalThis, "setInterval");
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    const tick = intervalSpy.mock.calls.find((c) => c[1] === 60_000)?.[0] as
      | (() => void)
      | undefined;
    intervalSpy.mockRestore();
    // Tasks restored on (re)start are not reported again
    expect(mocks.reportPrime).toHaveBeenCalled();

    const onDone = mocks.checkRunnerArgs.value?.[2] as (r: unknown) => void;
    act(() =>
      onDone({
        worker: "Worker 1",
        taskId: "T1",
        result: { passed: true, runs: [], outputTail: "" },
        commit: "abc1234",
        payload: "REPORT",
      }),
    );

    // Not due yet: nothing written
    act(() => tick?.());
    expect(mocks.writeReportMock).not.toHaveBeenCalled();

    mocks.reportDue.mockReturnValueOnce(true);
    act(() => tick?.());
    const checks = mocks.formatReportMock.mock.calls[0]?.[1] as Map<
      string,
      unknown
    >;
    expect(checks.get("T1")).toEqual({
      passed: true,
      failedCommand: undefined,
      commit: "abc1234",
    });
    expect(mocks.writeReportMock).toHaveBeenCalledWith(
      expect.any(String),
      "REPORT MD",
      expect.any(Date),
    );
    expect(mocks.notifyMock).toHaveBeenCalledWith(
      "bell",
      "aihive",
      expect.any(String),
    );
  });

  it("unsubscribes handlers when unmounted", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    mocks.busUnsubscribe.mockClear();
    const { unmount } = render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    unmount();
    expect(mocks.busUnsubscribe).toHaveBeenCalledTimes(1);
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
        return mocks.busUnsubscribe;
      });
    await advanceToRunningState();
  });

  it("registers onMessage handler after reaching running state", () => {
    expect(mocks.capturedMsgHandlerRef.value).not.toBeNull();
  });

  it("type='result' → TaskManager.handleMessage() is called", () => {
    const msg = makeMsg({ type: "result", from: "worker-1" });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.tmHandleMessage).toHaveBeenCalledWith(msg, undefined);
  });

  it("type='error' → TaskManager.handleMessage() is called", () => {
    const msg = makeMsg({ type: "error", from: "worker-1" });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.tmHandleMessage).toHaveBeenCalledWith(msg, undefined);
  });

  it("type='task' → TaskManager.handleMessage() is called", () => {
    const msg = makeMsg({ type: "task", from: "coordinator", to: "worker-1" });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.tmHandleMessage).toHaveBeenCalledWith(msg, undefined);
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

  it("matches protocol slugs to agent display names for status", async () => {
    const statusOf = () =>
      (
        (globalThis as Record<string, unknown>).__dashboardAgents as {
          name: string;
          status: string;
        }[]
      ).find((a) => a.name === "Orchestrator")?.status;
    expect(statusOf()).toBe("running");
    await act(async () => {
      mocks.capturedMsgHandlerRef.value?.(
        makeMsg({ type: "result", from: "orchestrator", to: "user" }),
      );
      await Promise.resolve();
    });
    expect(statusOf()).toBe("done");
  });

  it("type='skill-proposal' rejected by SkillManager → not counted", () => {
    mocks.smPropose.mockReturnValue(false);
    const msg = makeMsg({
      type: "skill-proposal",
      payload: JSON.stringify({ id: "../evil" }),
    });
    expect(() => mocks.capturedMsgHandlerRef.value?.(msg)).not.toThrow();
    expect(mocks.smGetCounts).not.toHaveBeenCalledAfter(mocks.smPropose);
  });

  it("type='memory-write' with an unsafe id → MemoryManager.write() is not called", () => {
    const msg = makeMsg({
      type: "memory-write",
      payload: JSON.stringify({ id: "../../etc", key: "k", value: "v" }),
    });
    mocks.capturedMsgHandlerRef.value?.(msg);
    expect(mocks.mmWrite).not.toHaveBeenCalled();
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

describe("App - runtime lifecycle", () => {
  beforeEach(() => {
    mocks.sessionExistsMock.mockReturnValue(false);
    mocks.initWorkspaceMock.mockClear();
    mocks.busUnsubscribe.mockClear();
    mocks.mockBus.onMessage.mockClear();
    mocks.mockBus.startWatching.mockClear();
    mocks.mockBus.stopWatching.mockClear();
    mocks.mockBus.setNudgeConfig.mockClear();
    mocks.tmOnChange.mockClear();
  });

  it("fresh start initializes the workspace with reset: true", async () => {
    await advanceToRunningState();
    expect(mocks.initWorkspaceMock).toHaveBeenCalledTimes(1);
    expect(mocks.initWorkspaceMock).toHaveBeenCalledWith(expect.anything(), {
      reset: true,
    });
  });

  it("reattach configures tmux nudges for the existing session", async () => {
    mocks.sessionExistsMock.mockReturnValue(true);
    render(<App />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(mocks.mockBus.setNudgeConfig).toHaveBeenCalledWith(
      expect.objectContaining({ sessionName: "test-session" }),
    );
  });

  it("stopping unsubscribes message and task handlers", async () => {
    const taskUnsubscribe = vi.fn();
    mocks.tmOnChange.mockReturnValueOnce(taskUnsubscribe);
    const { stdin } = await advanceToRunningState();

    await act(async () => {
      stdin.write("x");
      await Promise.resolve();
    });

    expect(mocks.busUnsubscribe).toHaveBeenCalledTimes(1);
    expect(taskUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mocks.mockBus.stopWatching).toHaveBeenCalledTimes(1);
  });

  it("L opens the log screen with the logs, and it can close", async () => {
    const g = globalThis as Record<string, unknown>;
    g.__logViewProps = undefined;
    const { stdin } = await advanceToRunningState();
    expect(g.__logViewProps).toBeUndefined();

    await act(async () => {
      stdin.write("L");
      await Promise.resolve();
    });
    const props = g.__logViewProps as { logs: string[]; onClose: () => void };
    expect(props.logs.some((l) => l.includes("Workspace initialized"))).toBe(
      true,
    );

    g.__logViewProps = undefined;
    await act(async () => {
      props.onClose();
      await Promise.resolve();
    });
    expect(g.__logViewProps).toBeUndefined();
  });

  it("T opens the task screen with the task list, and it can close", async () => {
    const task = { id: "T1", state: "running", assignedTo: "worker-1" };
    mocks.tmGetAll.mockReturnValue([task]);
    const g = globalThis as Record<string, unknown>;
    g.__taskViewProps = undefined;
    const { stdin } = await advanceToRunningState();
    expect(g.__taskViewProps).toBeUndefined();

    await act(async () => {
      stdin.write("T");
      await Promise.resolve();
    });
    const props = g.__taskViewProps as {
      tasks: unknown[];
      onClose: () => void;
    };
    expect(props.tasks).toEqual([task]);

    g.__taskViewProps = undefined;
    await act(async () => {
      props.onClose();
      await Promise.resolve();
    });
    expect(g.__taskViewProps).toBeUndefined();
    mocks.tmGetAll.mockReturnValue([]);
  });

  it("stop → start keeps exactly one active handler of each kind", async () => {
    const { stdin } = await advanceToRunningState();

    await act(async () => {
      stdin.write("x");
      await Promise.resolve();
    });

    const onSelect = (globalThis as Record<string, unknown>).__menuOnSelect as
      | ((k: string) => void)
      | undefined;
    await act(async () => {
      onSelect?.("start");
      await Promise.resolve();
    });
    const onComplete = (globalThis as Record<string, unknown>)
      .__startupOnComplete as (() => void) | undefined;
    await act(async () => {
      onComplete?.();
      await Promise.resolve();
    });

    const registeredMessages = mocks.mockBus.onMessage.mock.calls.length;
    const registeredTasks = mocks.tmOnChange.mock.calls.length;
    expect(registeredMessages).toBe(2);
    expect(registeredTasks).toBe(2);
    // Every registration except the live one has been unsubscribed
    expect(mocks.busUnsubscribe).toHaveBeenCalledTimes(registeredMessages - 1);
  });
});

describe("App - agents stuck at the pane", () => {
  beforeEach(() => {
    mocks.sessionExistsMock.mockReturnValue(false);
    mocks.paneCommandMock.mockReset().mockReturnValue("claude");
    mocks.restartAgentMock.mockReset();
    mocks.sendRawKeysMock.mockReset();
    mocks.sendLiteralMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("notices a CLI that exited to the shell, and R restarts it", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const { stdin, lastFrame } = await advanceToRunningState();
    expect(lastFrame()).not.toContain("R:");

    // The CLI quits (e.g. the folder trust check was declined)
    mocks.paneCommandMock.mockReturnValue("zsh");
    await act(async () => {
      vi.advanceTimersByTime(3000);
      await Promise.resolve();
    });
    expect(lastFrame()).toContain("Orchestrator");
    expect(lastFrame()).toContain("R:");

    await act(async () => {
      stdin.write("R");
      await Promise.resolve();
    });
    expect(mocks.restartAgentMock).toHaveBeenCalledWith(
      "test-session",
      "orchestrator",
      expect.objectContaining({ name: "Orchestrator" }),
      undefined,
    );
    expect(lastFrame()).not.toContain("R:");
  });

  it("R does nothing while the CLI is still running", async () => {
    const { stdin } = await advanceToRunningState();
    await act(async () => {
      stdin.write("R");
      await Promise.resolve();
    });
    expect(mocks.restartAgentMock).not.toHaveBeenCalled();
  });

  it("D sends every key straight to the pane until Ctrl+Q", async () => {
    const { stdin } = await advanceToRunningState();
    await act(async () => {
      stdin.write("D");
      await Promise.resolve();
    });
    await act(async () => {
      stdin.write("y");
      await Promise.resolve();
    });
    await act(async () => {
      stdin.write("\u001B[B");
      await Promise.resolve();
    });
    await act(async () => {
      stdin.write("\r");
      await Promise.resolve();
    });
    expect(mocks.sendLiteralMock).toHaveBeenCalledWith(
      "test-session",
      "orchestrator",
      "y",
    );
    expect(mocks.sendRawKeysMock.mock.calls.map((c) => c[2])).toEqual([
      ["Down"],
      ["Enter"],
    ]);

    await act(async () => {
      stdin.write("\u0011"); // Ctrl+Q
      await Promise.resolve();
    });
    await act(async () => {
      stdin.write("y");
      await Promise.resolve();
    });
    expect(mocks.sendLiteralMock).toHaveBeenCalledTimes(1);
  });
});

describe("App - folder trust before the agents start", () => {
  beforeEach(() => {
    mocks.sessionExistsMock.mockReturnValue(false);
    mocks.untrustedDirsMock.mockReset().mockReturnValue(["/proj"]);
    mocks.trustDirsMock.mockReset();
    vi.mocked(startSession).mockClear();
  });

  afterEach(() => {
    mocks.untrustedDirsMock.mockReset().mockReturnValue([]);
  });

  it("asks once, then trusts every folder and starts on y", async () => {
    const { stdin, lastFrame } = await advanceToRunningState();
    expect(lastFrame()).toContain("/proj");
    expect(startSession).not.toHaveBeenCalled();

    await act(async () => {
      stdin.write("y");
      await Promise.resolve();
    });
    expect(mocks.trustDirsMock).toHaveBeenCalledWith(["/proj"]);
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it("starts without saving anything on n", async () => {
    const { stdin } = await advanceToRunningState();
    await act(async () => {
      stdin.write("n");
      await Promise.resolve();
    });
    expect(mocks.trustDirsMock).not.toHaveBeenCalled();
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it("still starts when the trust cannot be saved", async () => {
    mocks.trustDirsMock.mockImplementation(() => {
      throw new Error("bad json");
    });
    const { stdin } = await advanceToRunningState();
    await act(async () => {
      stdin.write("y");
      await Promise.resolve();
    });
    expect(startSession).toHaveBeenCalledTimes(1);
  });

  it("skips the question when every folder is trusted", async () => {
    mocks.untrustedDirsMock.mockReturnValue([]);
    await advanceToRunningState();
    expect(startSession).toHaveBeenCalledTimes(1);
  });
});
