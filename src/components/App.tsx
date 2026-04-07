import { Box, Text, useApp, useInput, useStdout } from "ink";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadSlashCommands } from "../lib/commands.js";
import type { AihiveConfig } from "../lib/config.js";
import { loadConfig, saveConfig } from "../lib/config.js";
import type { MessageBus } from "../lib/mailbox.js";
import { MemoryManager } from "../lib/memory.js";
import type { QuickCommand } from "../lib/quick-commands.js";
import { groupByCategory, loadQuickCommands } from "../lib/quick-commands.js";
import type { SkillState } from "../lib/skills.js";
import { SkillManager } from "../lib/skills.js";
import type { Task } from "../lib/tasks.js";
import { TaskManager } from "../lib/tasks.js";
import type { AgentInfo } from "../lib/tmux.js";
import {
  buildAgentList,
  sendToPane,
  sessionExists,
  startSession,
  stopSession,
} from "../lib/tmux.js";
import { initWorkspace } from "../lib/workspace.js";
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

type AppState = "idle" | "settings" | "starting" | "running" | "stopping";
type Mode = "normal" | "input" | "quickcmd";

export function App() {
  const { exit } = useApp();
  const { stdout } = useStdout();
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
          a.name === name
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

  // Watch mailbox messages for status changes
  useEffect(() => {
    if (state !== "running") return;
    const bus = messageBusRef.current;
    if (!bus) return;

    const tm = taskManagerRef.current;
    tm.onChange((task) => {
      setTasks(tm.getAll());
      if (task.state === "blocked") {
        addLog(`Task ${task.id} blocked by: ${task.blockedBy.join(", ")}`);
      }
    });

    bus.onMessage((msg) => {
      addLog(
        `[${msg.from} → ${msg.to}] ${msg.type}: ${msg.payload.slice(0, 60)}`,
      );
      tm.handleMessage(msg);

      if (msg.type === "result") {
        updateAgentStatus(msg.from, "done");
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
            sm.propose(skillData);
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
            const entry = JSON.parse(msg.payload);
            entry.created_by = entry.created_by ?? msg.from;
            entry.created_at = entry.created_at ?? new Date().toISOString();
            entry.updated_at = new Date().toISOString();
            entry.tags = entry.tags ?? [];
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
          const results = mm.search(
            msg.payload.trim(),
            msg.from.toLowerCase().replace(/\s+/g, "-"),
          );
          messageBusRef.current.send(
            "system",
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

    return () => bus.stopWatching();
  }, [state, config, addLog, updateAgentStatus]);

  // Handle startup completion
  const handleStartupComplete = useCallback(() => {
    const bus = initWorkspace(config);
    messageBusRef.current = bus;
    taskManagerRef.current.clear();
    setTasks([]);

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

    addLog("Workspace initialized");

    const agentInfos = buildAgentList(config);
    setAgents(agentInfos.map((a) => ({ ...a, status: "running" })));

    // Configure tmux nudge: notify agents when new messages arrive in their inbox
    const paneTargets = new Map<string, string>();
    for (const a of agentInfos) {
      const slug = a.name.toLowerCase().replace(/\s+/g, "-");
      paneTargets.set(slug, a.paneTarget);
    }
    bus.setNudgeConfig({ sessionName: config.session, paneTargets });

    addLog("Starting tmux session...");
    try {
      startSession(config, stdout?.columns ?? 200, stdout?.rows ?? 50);
      addLog(`All ${config.agents.length} agents started`);
      setState("running");
    } catch (e) {
      addLog(`Error: ${e}`);
      setState("idle");
      setAgents(buildAgentList(config));
    }
  }, [config, addLog, stdout]);

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

  const termHeight = stdout?.rows ?? 40;

  // Running / Stopping: show control panel
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
              lines={Math.max(
                10,
                (stdout?.rows ?? 40) - (mode === "input" ? 15 : 10),
              )}
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
