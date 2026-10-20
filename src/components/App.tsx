import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckRunner } from "../lib/checks.js";
import { loadSlashCommands } from "../lib/commands.js";
import type { AihiveConfig } from "../lib/config.js";
import {
  initInstructions,
  loadConfig,
  saveConfig,
  stallMinutesOf,
} from "../lib/config.js";
import { type MessageBus, SYSTEM_MAILBOX, toSlug } from "../lib/mailbox.js";
import { MemoryManager, normalizeMemoryEntry } from "../lib/memory.js";
import type { QuickCommand } from "../lib/quick-commands.js";
import { groupByCategory, loadQuickCommands } from "../lib/quick-commands.js";
import {
  CompletionReporter,
  formatReport,
  type TaskCheck,
  writeReport,
} from "../lib/report.js";
import type { SkillState } from "../lib/skills.js";
import { SkillManager } from "../lib/skills.js";
import type { Task } from "../lib/tasks.js";
import {
  loadTasks,
  StallMonitor,
  saveTasks,
  TaskManager,
  taskIdOf,
  tasksFilePath,
} from "../lib/tasks.js";
import type { AgentInfo } from "../lib/tmux.js";
import {
  buildAgentList,
  sendToPane,
  sessionExists,
  startSession,
  stopSession,
} from "../lib/tmux.js";
import { initWorkspace } from "../lib/workspace.js";
import { prepareWorkspaces } from "../lib/worktrees.js";
import { CommandInput } from "./CommandInput.js";
import { Dashboard } from "./Dashboard.js";
import { Header } from "./Header.js";
import { HelpBar } from "./HelpBar.js";
import { LogView } from "./LogView.js";
import { MainMenu } from "./MainMenu.js";
import { OverviewMode } from "./OverviewMode.js";
import type { PromptInfo } from "./PaneView.js";
import { PaneView } from "./PaneView.js";
import { QuickCommandMenu } from "./QuickCommandMenu.js";
import { SettingsScreen } from "./SettingsScreen.js";
import { StartupScreen } from "./StartupScreen.js";
import { TaskView } from "./TaskView.js";

type AppState = "idle" | "settings" | "starting" | "running" | "stopping";
type Mode = "normal" | "input" | "quickcmd" | "tasks";

export function App() {
  const { exit } = useApp();
  const { columns, rows } = useWindowSize();
  const [config, setConfig] = useState<AihiveConfig>(() => loadConfig());
  const [state, setState] = useState<AppState>(
    sessionExists(config.session) ? "running" : "idle",
  );
  const [logs, setLogs] = useState<string[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>(() =>
    buildAgentList(config),
  );
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [mode, setMode] = useState<Mode>("normal");
  const [showLog, setShowLog] = useState(false);
  const [showOverview, setShowOverview] = useState(false);
  const [promptInfo, setPromptInfo] = useState<PromptInfo>({
    detected: false,
    options: [],
  });
  const slashCommands = useMemo(() => loadSlashCommands(process.cwd()), []);
  const quickCommands = useMemo(() => loadQuickCommands(process.cwd()), []);
  const quickCategories = useMemo(
    () => groupByCategory(quickCommands),
    [quickCommands],
  );

  const messageBusRef = useRef<MessageBus | null>(null);
  const taskManagerRef = useRef<TaskManager>(new TaskManager());
  const skillManagerRef = useRef<SkillManager | null>(null);
  const memoryManagerRef = useRef<MemoryManager | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [stalledIds, setStalledIds] = useState<string[]>([]);
  const [taskChecks, setTaskChecks] = useState<ReadonlyMap<string, TaskCheck>>(
    () => new Map(),
  );
  const [skillCounts, setSkillCounts] = useState<Record<SkillState, number>>({
    proposed: 0,
    approved: 0,
    rejected: 0,
  });
  const [memoryCount, setMemoryCount] = useState(0);
  const selectedAgent = agents[selectedIndex];

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setLogs((prev) => [...prev.slice(-30), `${time} ${message}`]);
  }, []);

  const updateAgentStatus = useCallback(
    (name: string, status: AgentInfo["status"]) => {
      setAgents((prev) =>
        prev.map((a) =>
          toSlug(a.name) === toSlug(name)
            ? {
                ...a,
                status,
                updatedAt: new Date().toLocaleTimeString("ja-JP", {
                  hour: "2-digit",
                  minute: "2-digit",
                }),
              }
            : a,
        ),
      );
    },
    [],
  );

  // Create the mailbox / skill / memory runtime for the current config.
  // `reset` wipes old mailbox contents (fresh start); reattaching keeps them.
  const setupRuntime = useCallback(
    (reset: boolean): MessageBus => {
      const bus = initWorkspace(config, { reset });
      const synced = initInstructions();
      if (synced.updated.length > 0) {
        addLog(`Instructions updated: ${synced.updated.join(", ")}`);
      }
      if (synced.kept.length > 0) {
        addLog(
          `Instructions kept (edited locally, not updated): ${synced.kept.join(", ")}`,
        );
      }
      messageBusRef.current = bus;
      // A relaunch keeps the task list; a fresh start begins empty
      const tm = taskManagerRef.current;
      const tasksFile = tasksFilePath(process.cwd());
      if (reset) {
        tm.clear();
        saveTasks(tasksFile, []);
      } else {
        tm.restore(loadTasks(tasksFile));
      }
      setTasks(tm.getAll());

      const sm = new SkillManager(process.cwd());
      sm.init();
      skillManagerRef.current = sm;
      setSkillCounts(sm.getCounts());

      const mm = new MemoryManager(process.cwd());
      const agentSlugs = config.agents.map((a) =>
        a.name.toLowerCase().replace(/\s+/g, "-"),
      );
      mm.init(agentSlugs);
      memoryManagerRef.current = mm;
      setMemoryCount(mm.getCount());

      const agentInfos = buildAgentList(config);
      setAgents(agentInfos.map((a) => ({ ...a, status: "running" })));

      // Configure tmux nudge: notify agents when new messages arrive in their inbox
      const paneTargets = new Map<string, string>();
      for (const a of agentInfos) {
        const slug = a.name.toLowerCase().replace(/\s+/g, "-");
        paneTargets.set(slug, a.paneTarget);
      }
      bus.setNudgeConfig({ sessionName: config.session, paneTargets });

      return bus;
    },
    [config, addLog],
  );

  // Watch mailbox messages for status changes
  useEffect(() => {
    if (state !== "running") return;
    let bus = messageBusRef.current;
    if (!bus) {
      // aihive was relaunched while the tmux session was still alive
      bus = setupRuntime(false);
      addLog("Reattached to existing session");
    }

    const tm = taskManagerRef.current;
    const tasksFile = tasksFilePath(process.cwd());
    const unsubscribeTasks = tm.onChange((task) => {
      setTasks(tm.getAll());
      saveTasks(tasksFile, tm.getAll());
      if (task.state === "blocked") {
        addLog(`Task ${task.id} blocked by: ${task.blockedBy.join(", ")}`);
      }
    });

    // Run the user's check commands when a worker reports a result, and send
    // the outcome to the reviewers (or the coordinator when there is none)
    let disposed = false;
    const checkResults = new Map<string, TaskCheck>();
    const checks = config.checks ?? [];
    const checkRunner =
      checks.length > 0
        ? new CheckRunner(
            checks,
            process.cwd(),
            ({ worker, taskId, result, commit, payload }) => {
              if (disposed) return;
              if (taskId) {
                checkResults.set(taskId, {
                  passed: result.passed,
                  failedCommand: result.failedCommand,
                  commit,
                });
                setTaskChecks(new Map(checkResults));
              }
              addLog(
                `Checks ${result.passed ? "passed" : `failed (${result.failedCommand})`} for ${worker}${taskId ? ` ${taskId}` : ""}`,
              );
              const reviewers = config.agents.filter(
                (a) => a.role === "reviewer",
              );
              const recipients = reviewers.length
                ? reviewers
                : config.agents.filter((a) => a.role === "coordinator");
              for (const r of recipients) {
                bus.send(
                  SYSTEM_MAILBOX,
                  toSlug(r.name),
                  "check-result",
                  payload,
                );
              }
            },
          )
        : null;

    const unsubscribeMessages = bus.onMessage((msg) => {
      addLog(
        `[${msg.from} → ${msg.to}] ${msg.type}: ${String(msg.payload ?? "").slice(0, 60)}`,
      );
      tm.handleMessage(
        msg,
        config.agents.find((a) => toSlug(a.name) === toSlug(msg.to))?.role,
      );

      if (msg.type === "result") {
        updateAgentStatus(msg.from, "done");
        const sender = config.agents.find(
          (a) => toSlug(a.name) === toSlug(msg.from),
        );
        if (checkRunner && sender?.role === "worker") {
          const taskId = taskIdOf(msg);
          addLog(
            `Running checks for ${sender.name}${taskId ? ` ${taskId}` : ""}`,
          );
          void checkRunner.run(sender.name, taskId);
        }
      } else if (msg.type === "error") {
        updateAgentStatus(msg.from, "error");
      } else if (msg.type === "task") {
        updateAgentStatus(msg.to, "running");
      } else if (msg.type === "consult") {
        updateAgentStatus(msg.to, "running");
      } else if (msg.type === "advice") {
        updateAgentStatus(msg.from, "done");
      } else if (msg.type === "skill-proposal") {
        const sm = skillManagerRef.current;
        if (sm) {
          try {
            const skillData = JSON.parse(msg.payload);
            if (!sm.propose(skillData)) throw new Error("invalid skill");
            setSkillCounts(sm.getCounts());
            addLog(`Skill proposed: ${skillData.name ?? skillData.id}`);
          } catch {
            addLog(`Invalid skill-proposal payload from ${msg.from}`);
          }
        }
      } else if (msg.type === "skill-approved") {
        const sm = skillManagerRef.current;
        if (sm) {
          const approved = sm.approve(msg.payload.trim(), msg.from);
          if (approved) {
            setSkillCounts(sm.getCounts());
            addLog(`Skill approved: ${msg.payload.trim()}`);
          }
        }
      } else if (msg.type === "skill-rejected") {
        const sm = skillManagerRef.current;
        if (sm) {
          const rejected = sm.reject(msg.payload.trim());
          if (rejected) {
            setSkillCounts(sm.getCounts());
            addLog(`Skill rejected: ${msg.payload.trim()}`);
          }
        }
      } else if (msg.type === "memory-write") {
        const mm = memoryManagerRef.current;
        if (mm) {
          try {
            const entry = normalizeMemoryEntry(
              JSON.parse(msg.payload),
              msg.from,
            );
            if (!entry) throw new Error("invalid memory entry");
            entry.updated_at = new Date().toISOString();
            mm.write(entry);
            setMemoryCount(mm.getCount());
            addLog(`Memory saved: ${entry.key} by ${msg.from}`);
          } catch {
            addLog(`Invalid memory-write payload from ${msg.from}`);
          }
        }
      } else if (msg.type === "memory-read") {
        const mm = memoryManagerRef.current;
        if (mm && messageBusRef.current) {
          const results = mm.search(msg.payload.trim(), toSlug(msg.from));
          messageBusRef.current.send(
            SYSTEM_MAILBOX,
            msg.from,
            "memory-response",
            JSON.stringify(results),
          );
          addLog(
            `Memory query: "${msg.payload.trim()}" → ${results.length} results for ${msg.from}`,
          );
        }
      }
    });

    const agentNames = config.agents.map((a) => a.name);
    bus.startWatching(agentNames);

    // Mark tasks with no recent update and remind their agent once
    const stallMinutes = stallMinutesOf(config);
    const monitor = new StallMonitor(stallMinutes * 60_000);
    // Write a completion report once every task has finished; tasks that
    // were already finished when aihive (re)started are not reported again
    const reporter = new CompletionReporter();
    reporter.prime(tm.getAll());
    const stallTimer = setInterval(() => {
      const now = Date.now();
      const all = tm.getAll();
      if (reporter.due(all, now)) {
        try {
          const file = writeReport(
            process.cwd(),
            formatReport(all, checkResults, new Date(now)),
            new Date(now),
          );
          addLog(`Completion report written: ${file}`);
        } catch (e) {
          addLog(`Could not write completion report: ${e}`);
        }
      }
      const { stalled, toRemind } = monitor.check(all, now);
      setStalledIds(stalled.map((t) => t.id));
      for (const task of toRemind) {
        const reminded = bus.remindStalled(
          toSlug(task.assignedTo),
          task.id,
          stallMinutes,
        );
        addLog(
          `Task ${task.id} stalled: no update for ${stallMinutes}m${reminded ? `, reminded ${task.assignedTo}` : ""}`,
        );
      }
    }, 60_000);

    return () => {
      disposed = true;
      clearInterval(stallTimer);
      unsubscribeMessages();
      unsubscribeTasks();
      bus.stopWatching();
    };
  }, [state, config, addLog, updateAgentStatus, setupRuntime]);

  // Handle startup completion
  const handleStartupComplete = useCallback(() => {
    setupRuntime(true);
    addLog("Workspace initialized");

    addLog("Starting tmux session...");
    try {
      // Subtract Dashboard(34) + margin(1) + border(2) + paddingX(2) + outer padding(2) = ~41
      const paneWidth = Math.max(80, columns - 41);
      const plan = prepareWorkspaces(config, process.cwd());
      for (const message of plan.messages) addLog(message);
      startSession(config, paneWidth, rows, plan.workspaces);
      addLog(`All ${config.agents.length} agents started`);
      setState("running");
    } catch (e) {
      addLog(`Error: ${e}`);
      setState("idle");
      setAgents(buildAgentList(config));
    }
  }, [config, addLog, columns, rows, setupRuntime]);

  // Menu selection handler
  const handleMenuSelect = useCallback(
    (key: string) => {
      if (key === "start") {
        setState("starting");
      } else if (key === "config") {
        setState("settings");
      } else if (key === "quit") {
        exit();
      }
    },
    [exit],
  );

  // Running mode key bindings
  useInput(
    (input, key) => {
      if (key.upArrow || input === "k") {
        setSelectedIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedIndex((prev) => Math.min(agents.length - 1, prev + 1));
        return;
      }
      if (input === "x") {
        setState("stopping");
        addLog("Stopping agents...");
        try {
          stopSession(config.session);
          setAgents(buildAgentList(config));
          addLog("All agents stopped");
        } catch (e) {
          addLog(`Error stopping: ${e}`);
        }
        setState("idle");
        return;
      }
      if (key.return || input === "i") {
        setMode("input");
        return;
      }
      if (input === "T") {
        setMode("tasks");
        return;
      }
      if (input === "O") {
        setShowOverview((prev) => !prev);
        return;
      }
      if (input === "L") {
        setShowLog((prev) => !prev);
        return;
      }
      if (input === "q") {
        stopSession(config.session);
        exit();
        return;
      }
    },
    { isActive: state === "running" && mode === "normal" },
  );

  const handleCommandSubmit = useCallback(
    (text: string) => {
      sendToPane(config.session, selectedAgent.paneTarget, text);
      addLog(`→ ${selectedAgent.name}: ${text}`);
    },
    [config.session, selectedAgent, addLog],
  );

  const handleQuickKey = useCallback(
    (key: string) => {
      sendToPane(config.session, selectedAgent.paneTarget, key);
      addLog(`→ ${selectedAgent.name}: [${key}]`);
    },
    [config.session, selectedAgent, addLog],
  );

  const handleCommandCancel = useCallback(() => {
    setMode("normal");
  }, []);

  const handleQuickCommandSelect = useCallback(
    (cmd: QuickCommand) => {
      sendToPane(config.session, selectedAgent.paneTarget, cmd.prompt);
      addLog(`⚡ ${selectedAgent.name}: ${cmd.name}`);
      setMode("normal");
    },
    [config.session, selectedAgent, addLog],
  );

  const handleQuickCommandClose = useCallback(() => {
    setMode("normal");
  }, []);

  const handleDoubleSlash = useCallback(() => {
    setMode("quickcmd");
  }, []);

  // Idle: show main menu
  if (state === "idle") {
    const roleCounts: Record<string, number> = {};
    for (const a of config.agents) {
      roleCounts[a.role] = (roleCounts[a.role] ?? 0) + 1;
    }
    return (
      <MainMenu
        onSelect={handleMenuSelect}
        agents={config.agents.length}
        roleCounts={roleCounts}
      />
    );
  }

  // Settings screen
  if (state === "settings") {
    return (
      <SettingsScreen
        config={config}
        onSave={(updated) => {
          saveConfig(updated);
          setConfig(updated);
          setAgents(buildAgentList(updated));
          setState("idle");
        }}
        onBack={() => setState("idle")}
      />
    );
  }

  // Starting: show startup animation
  if (state === "starting") {
    return <StartupScreen onComplete={handleStartupComplete} />;
  }

  const termHeight = rows;

  // Running / Stopping: show control panel
  if (mode === "tasks") {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Header
          state={state}
          agents={agents}
          taskCount={tasks.length}
          skillCount={skillCounts.approved}
          memoryCount={memoryCount}
        />
        <Box marginTop={1} flexGrow={1} overflow="hidden">
          <TaskView
            tasks={tasks}
            stalledIds={stalledIds}
            checks={taskChecks}
            height={Math.max(8, rows - 8)}
            onClose={() => setMode("normal")}
          />
        </Box>
      </Box>
    );
  }

  if (showOverview) {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Header
          state={state}
          agents={agents}
          taskCount={tasks.length}
          skillCount={skillCounts.approved}
          memoryCount={memoryCount}
        />
        <Box marginTop={1} flexGrow={1} overflow="hidden">
          <OverviewMode sessionName={config.session} agents={agents} />
        </Box>
        <Box marginTop={1}>
          <HelpBar state={state} />
        </Box>
      </Box>
    );
  }

  if (showLog) {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Header
          state={state}
          agents={agents}
          taskCount={tasks.length}
          skillCount={skillCounts.approved}
          memoryCount={memoryCount}
        />
        <Box marginTop={1} flexGrow={1} overflow="hidden">
          <LogView logs={logs} />
        </Box>
        <Box marginTop={1}>
          <HelpBar state={state} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" padding={1} height={termHeight}>
      <Header
        state={state}
        agents={agents}
        taskCount={tasks.length}
        skillCount={skillCounts.approved}
      />

      <Box marginTop={1} flexGrow={1}>
        {mode !== "input" && (
          <Box flexDirection="column" width={34} marginRight={1}>
            <Dashboard
              agents={agents}
              selectedIndex={selectedIndex}
              tasks={tasks}
              stalledIds={stalledIds}
              skillCounts={skillCounts}
              memoryCount={memoryCount}
            />
          </Box>
        )}
        <Box flexDirection="column" flexGrow={1}>
          {selectedAgent ? (
            <PaneView
              sessionName={config.session}
              paneTarget={selectedAgent.paneTarget}
              label={selectedAgent.name}
              active={true}
              lines={Math.max(10, rows - (mode === "input" ? 15 : 10))}
              onPromptChange={setPromptInfo}
            />
          ) : (
            <Box
              borderStyle="single"
              borderColor="gray"
              paddingX={1}
              flexGrow={1}
            >
              <Text dimColor>No agent selected</Text>
            </Box>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        {mode === "quickcmd" ? (
          <QuickCommandMenu
            categories={quickCategories}
            onSelect={handleQuickCommandSelect}
            onClose={handleQuickCommandClose}
          />
        ) : mode === "input" ? (
          <CommandInput
            targetLabel={selectedAgent.name}
            onSubmit={handleCommandSubmit}
            onCancel={handleCommandCancel}
            onQuickKey={handleQuickKey}
            onDoubleSlash={handleDoubleSlash}
            promptInfo={promptInfo}
            slashCommands={slashCommands}
          />
        ) : (
          <HelpBar state={state} />
        )}
      </Box>
    </Box>
  );
}
