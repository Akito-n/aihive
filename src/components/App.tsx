import { Box, Text, useApp, useInput, useWindowSize } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckRunner } from "../lib/checks.js";
import { loadSlashCommands } from "../lib/commands.js";
import type { AihiveConfig } from "../lib/config.js";
import {
  initInstructions,
  loadConfig,
  notifyModeOf,
  saveConfig,
  stallMinutesOf,
} from "../lib/config.js";
import { itemName, recordLook, sellPrice } from "../lib/gear.js";
import { t, tf } from "../lib/i18n.js";
import { type MessageBus, SYSTEM_MAILBOX, toSlug } from "../lib/mailbox.js";
import { MemoryManager, normalizeMemoryEntry } from "../lib/memory.js";
import { onResolvedModelsChange } from "../lib/model-resolver.js";
import { questMonsterOf } from "../lib/monsters.js";
import { notify } from "../lib/notify.js";
import {
  awardTask,
  buyGood,
  equipItem,
  loadProgress,
  memberLevelOf,
  type Progress,
  partyLevelOf,
  recordSkillUses,
  sellItem,
  setLooks,
} from "../lib/progress.js";
import type { QuickCommand } from "../lib/quick-commands.js";
import { groupByCategory, loadQuickCommands } from "../lib/quick-commands.js";
import {
  CompletionReporter,
  formatReport,
  type TaskCheck,
  writeReport,
} from "../lib/report.js";
import {
  awardMessage,
  mailMessage,
  movesMessage,
  poisonMessage,
  type RpgMessage,
} from "../lib/rpg-messages.js";
import { findSkillUses, type SkillUse } from "../lib/skill-usage.js";
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
import {
  helpBarHeight,
  isRetro,
  jobKeyOf,
  saveTheme,
  setLook,
  type ThemeName,
} from "../lib/theme.js";
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
import {
  currentTaskOf,
  DASH_TABS,
  Dashboard,
  type DashTab,
  type JournalEntry,
  memberStateOf,
  PartyHud,
} from "./Dashboard.js";
import { EquipView } from "./EquipView.js";
import { Header } from "./Header.js";
import { HelpBar } from "./HelpBar.js";
import { LogView } from "./LogView.js";
import { MainMenu } from "./MainMenu.js";
import { OverviewMode } from "./OverviewMode.js";
import type { PromptInfo } from "./PaneView.js";
import { PaneView } from "./PaneView.js";
import { QuickCommandMenu } from "./QuickCommandMenu.js";
import { SettingsScreen } from "./SettingsScreen.js";
import { ShopView } from "./ShopView.js";
import { StartupScreen } from "./StartupScreen.js";
import { StatusView } from "./StatusView.js";
import { TaskView } from "./TaskView.js";

/** Log lines kept for the log screen */
const LOG_LIMIT = 500;

/** Width of the party column beside the pane */
const LEFT_COLUMN_WIDTH = 34;
/** Narrowest pane that shows the floor and gold beside its title */
const BADGE_MIN_PANE_WIDTH = 60;
/** How many story lines the adventure tab keeps */
const JOURNAL_LIMIT = 30;

type AppState = "idle" | "settings" | "starting" | "running" | "stopping";
type Mode =
  | "normal"
  | "input"
  | "quickcmd"
  | "tasks"
  | "log"
  | "status"
  | "equip"
  | "shop";

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
  // Re-render when the Claude aliases' versions are looked up
  const [, setModelsVersion] = useState(0);
  useEffect(
    () => onResolvedModelsChange(() => setModelsVersion((v) => v + 1)),
    [],
  );
  const [mode, setMode] = useState<Mode>("normal");
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
  // Where the agents work and since when, to find their skill uses
  const historyRef = useRef<{ cwds: string[]; since: number }>({
    cwds: [],
    since: Date.now(),
  });
  // Count skill uses as special moves; game only, read from history
  const countMovesRef = useRef<(uses: SkillUse[]) => void>(() => {});
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
  // Latest line for the retro message window
  const [message, setMessage] = useState<RpgMessage | undefined>();
  // Story lines so far, newest first, for the adventure tab
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const journalIdRef = useRef(0);
  useEffect(() => {
    if (!message) return;
    const entry = { ...message, id: ++journalIdRef.current };
    setJournal((prev) => [entry, ...prev].slice(0, JOURNAL_LIMIT));
  }, [message]);
  // The tab under the party (retro look)
  const [dashTab, setDashTab] = useState<DashTab>("quests");
  // aihive's lasting adventure record (levels across sessions)
  const [progress, setProgress] = useState<Progress>(() => loadProgress());
  countMovesRef.current = (uses) => {
    try {
      const result = recordSkillUses(uses);
      if (!result) return;
      setProgress(result.progress);
      const message = movesMessage(result);
      if (message) setMessage(message);
      for (const name of result.learned) addLog(`New special move: ${name}`);
    } catch (e) {
      addLog(`Could not save progress: ${e}`);
    }
  };
  const selectedAgent = agents[selectedIndex];

  const addLog = useCallback((message: string) => {
    const time = new Date().toLocaleTimeString("ja-JP", {
      hour: "2-digit",
      minute: "2-digit",
    });
    setLogs((prev) => [...prev.slice(-(LOG_LIMIT - 1)), `${time} ${message}`]);
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
    const nameOf = (slug: string) =>
      config.agents.find((a) => toSlug(a.name) === toSlug(slug))?.name ?? slug;
    // Reward each task once as it finishes, not ones already finished
    const everStalled = new Set<string>();
    const finished = new Set(
      tm
        .getAll()
        .filter((task) => task.state === "done")
        .map((task) => task.id),
    );
    setMessage({ text: t("retro.msg.ready") });
    const unsubscribeTasks = tm.onChange((task) => {
      setTasks(tm.getAll());
      saveTasks(tasksFile, tm.getAll());
      if (task.state === "done" && task.assignedTo && !finished.has(task.id)) {
        finished.add(task.id);
        const name = nameOf(task.assignedTo);
        try {
          const award = awardTask({
            project: process.cwd(),
            task,
            member: {
              name,
              role:
                config.agents.find((a) => a.name === name)?.role ?? "worker",
            },
            checksPassed: checkResults.get(task.id)?.passed === true,
            stalled: everStalled.has(task.id),
            all: tm.getAll(),
          });
          if (award) {
            setProgress(award.progress);
            setLook(recordLook(award.progress));
            setMessage(awardMessage(award, task.id, t(questMonsterOf(task))));
            addLog(`+${award.xp} XP ${name} (${task.id})`);
            if (award.gold > 0) addLog(`+${award.gold} G`);
            for (const item of award.drops) {
              addLog(`Found ${itemName(item)} (${item.rarity})`);
            }
            const history = historyRef.current;
            countMovesRef.current(findSkillUses(history.cwds, history.since));
          }
        } catch (e) {
          addLog(`Could not save progress: ${e}`);
        }
      }
      if (task.state === "blocked") {
        addLog(`Task ${task.id} blocked by: ${task.blockedBy.join(", ")}`);
      }
    });

    // Run the user's check commands when a worker reports a result, and send
    // the outcome to the reviewers (or the coordinator when there is none)
    let disposed = false;
    const alert = (body: string) =>
      notify(notifyModeOf(config), "aihive", body);
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
              if (!result.passed) {
                alert(
                  tf("notify.checksFailed", {
                    worker,
                    task: taskId ?? "-",
                    command: result.failedCommand ?? "-",
                  }),
                );
              }
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
      const story = mailMessage(
        msg.type,
        nameOf(msg.from),
        nameOf(msg.to),
        taskIdOf(msg),
      );
      if (story) setMessage(story);
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
            // An approved aihive skill is a move the party learns
            countMovesRef.current([
              { id: `aihive:${msg.payload.trim()}`, skill: msg.payload.trim() },
            ]);
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
        const done = all.filter((t) => t.state === "done").length;
        alert(tf("notify.allDone", { done, failed: all.length - done }));
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
      for (const task of stalled) everStalled.add(task.id);
      if (toRemind.length > 0) {
        alert(
          tf("notify.stalled", {
            ids: toRemind.map((t) => t.id).join(", "),
            minutes: stallMinutes,
          }),
        );
      }
      for (const task of toRemind) {
        setMessage(poisonMessage(nameOf(task.assignedTo), task.id));
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
      historyRef.current = {
        cwds: [...plan.workspaces.values()].map((ws) => ws.cwd),
        since: Date.now(),
      };
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
      if (key.tab) {
        setDashTab(
          (prev) => DASH_TABS[(DASH_TABS.indexOf(prev) + 1) % DASH_TABS.length],
        );
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
        setMode("log");
        return;
      }
      if (input === "S") {
        setMode("status");
        return;
      }
      if (input === "E") {
        setMode("equip");
        return;
      }
      if (input === "G") {
        setMode("shop");
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
  if (mode === "log") {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Header
          state={state}
          agents={agents}
          partyLevel={partyLevelOf(progress)}
          taskCount={tasks.length}
          skillCount={skillCounts.approved}
          memoryCount={memoryCount}
        />
        <Box marginTop={1} flexGrow={1} overflow="hidden">
          <LogView
            logs={logs}
            height={Math.max(8, rows - 8)}
            onClose={() => setMode("normal")}
          />
        </Box>
      </Box>
    );
  }
  if (mode === "status") {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Header
          state={state}
          agents={agents}
          partyLevel={partyLevelOf(progress)}
          taskCount={tasks.length}
          skillCount={skillCounts.approved}
          memoryCount={memoryCount}
        />
        <Box marginTop={1} flexGrow={1} overflow="hidden">
          <StatusView
            progress={progress}
            members={config.agents}
            onClose={() => setMode("normal")}
          />
        </Box>
      </Box>
    );
  }
  if (mode === "shop") {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Header
          state={state}
          agents={agents}
          partyLevel={partyLevelOf(progress)}
          taskCount={tasks.length}
          skillCount={skillCounts.approved}
          memoryCount={memoryCount}
        />
        <Box marginTop={1} flexGrow={1} overflow="hidden">
          <ShopView
            progress={progress}
            onBuy={(key, price) => {
              try {
                const result = buyGood(key, price);
                setProgress(result.progress);
                if (result.bought) saveTheme(key as ThemeName);
                return result.bought;
              } catch (e) {
                addLog(`Could not save progress: ${e}`);
                return false;
              }
            }}
            onClose={() => setMode("normal")}
          />
        </Box>
      </Box>
    );
  }
  if (mode === "equip") {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Header
          state={state}
          agents={agents}
          partyLevel={partyLevelOf(progress)}
          taskCount={tasks.length}
          skillCount={skillCounts.approved}
          memoryCount={memoryCount}
        />
        <Box marginTop={1} flexGrow={1} overflow="hidden">
          <EquipView
            progress={progress}
            height={Math.max(3, rows - 22)}
            onEquip={(id) => {
              try {
                const next = equipItem(id);
                setProgress(next);
                setLook(recordLook(next));
              } catch (e) {
                addLog(`Could not save progress: ${e}`);
              }
            }}
            onToggleLooks={() => {
              try {
                const next = setLooks(!progress.looks);
                setProgress(next);
                setLook(recordLook(next));
              } catch (e) {
                addLog(`Could not save progress: ${e}`);
              }
            }}
            onSell={(id) => {
              const item = progress.bag.find((i) => i.id === id);
              try {
                setProgress(sellItem(id));
                if (item) {
                  setMessage({
                    text: tf("equip.sold", {
                      item: itemName(item),
                      gold: sellPrice(item),
                    }),
                  });
                }
              } catch (e) {
                addLog(`Could not save progress: ${e}`);
              }
            }}
            onClose={() => setMode("normal")}
          />
        </Box>
      </Box>
    );
  }
  if (mode === "tasks") {
    return (
      <Box flexDirection="column" padding={1} height={termHeight}>
        <Header
          state={state}
          agents={agents}
          partyLevel={partyLevelOf(progress)}
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
          partyLevel={partyLevelOf(progress)}
          taskCount={tasks.length}
          skillCount={skillCounts.approved}
          memoryCount={memoryCount}
        />
        <Box marginTop={1} flexGrow={1} overflow="hidden">
          <OverviewMode sessionName={config.session} agents={agents} />
        </Box>
        <Box marginTop={1}>
          <HelpBar state={state} message={message} />
        </Box>
      </Box>
    );
  }

  // Rows between the header and the help bar: padding, two header lines and two gaps
  const middleHeight = Math.max(8, rows - 6 - helpBarHeight());
  const paneTitle = selectedAgent
    ? (() => {
        const current = currentTaskOf(selectedAgent, tasks);
        const state = memberStateOf(
          selectedAgent,
          current,
          Boolean(current && stalledIds.includes(current.id)),
        );
        const jobKey = jobKeyOf(selectedAgent.role);
        return tf("retro.paneTitleFull", {
          name: selectedAgent.name,
          job: jobKey ? t(jobKey) : selectedAgent.role,
          level: memberLevelOf(progress, selectedAgent.name),
          state: state.text,
        });
      })()
    : undefined;

  return (
    <Box flexDirection="column" padding={1} height={termHeight}>
      <Header
        state={state}
        agents={agents}
        partyLevel={partyLevelOf(progress)}
        taskCount={tasks.length}
        skillCount={skillCounts.approved}
      />

      <Box marginTop={1} flexGrow={1}>
        {mode !== "input" && (
          <Box
            flexDirection="column"
            width={LEFT_COLUMN_WIDTH}
            marginRight={1}
            overflow="hidden"
          >
            <Dashboard
              agents={agents}
              levels={Object.fromEntries(
                agents.map((a) => [a.name, memberLevelOf(progress, a.name)]),
              )}
              selectedIndex={selectedIndex}
              tasks={tasks}
              stalledIds={stalledIds}
              skillCounts={skillCounts}
              memoryCount={memoryCount}
              height={middleHeight}
              tab={dashTab}
              journal={journal}
              floor={progress.adventure.floor}
              gold={progress.gold}
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
              lines={
                mode === "input"
                  ? Math.max(10, rows - 15)
                  : Math.max(4, middleHeight - 4)
              }
              onPromptChange={setPromptInfo}
              title={isRetro() ? paneTitle : undefined}
              badge={
                // Only where it cannot run into the title
                columns - 2 - LEFT_COLUMN_WIDTH - 1 >= BADGE_MIN_PANE_WIDTH && (
                  <Text color="yellow">
                    {tf("retro.hudFloor", { floor: progress.adventure.floor })}{" "}
                    {progress.gold}G
                  </Text>
                )
              }
              footer={
                <PartyHud
                  agents={agents}
                  tasks={tasks}
                  stalledIds={stalledIds}
                />
              }
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
          <HelpBar state={state} message={message} />
        )}
      </Box>
    </Box>
  );
}
