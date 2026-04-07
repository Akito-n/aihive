import { Box, Text } from "ink";
import type { AgentInfo } from "../lib/tmux.js";

interface HeaderProps {
  state: "idle" | "settings" | "starting" | "running" | "stopping";
  agents: AgentInfo[];
  taskCount?: number;
  skillCount?: number;
  memoryCount?: number;
}

const STATUS_MAP = {
  idle: { label: "IDLE", color: "gray" },
  settings: { label: "SETTINGS", color: "yellow" },
  starting: { label: "STARTING", color: "cyan" },
  running: { label: "RUNNING", color: "green" },
  stopping: { label: "STOPPING", color: "yellow" },
} as const;

export function Header({
  state,
  agents,
  taskCount = 0,
  skillCount = 0,
  memoryCount = 0,
}: HeaderProps) {
  const status = STATUS_MAP[state];

  // Model distribution summary (includes CLI prefix for non-claude)
  const modelCounts = new Map<string, number>();
  for (const a of agents) {
    const prefix = a.cli && a.cli !== "claude" ? `${a.cli}:` : "";
    const m = prefix + (a.model ?? "default");
    modelCounts.set(m, (modelCounts.get(m) ?? 0) + 1);
  }
  const modelSummary = [...modelCounts.entries()]
    .map(([m, c]) => `${c}x ${m}`)
    .join(", ");

  return (
    <Box flexDirection="column">
      <Box>
        <Text bold color="cyan">
          {"🐝 aihive"}
        </Text>
        <Text> </Text>
        <Text dimColor>v0.1.0</Text>
        <Text> </Text>
        <Text bold color={status.color}>
          [{status.label}]
        </Text>
      </Box>
      <Text dimColor>
        Agents: {agents.length}
        {modelSummary ? ` (${modelSummary})` : ""} | Tasks: {taskCount}
        {skillCount > 0 ? ` | Skills: ${skillCount}` : ""}
        {memoryCount > 0 ? ` | Memory: ${memoryCount}` : ""} | Session: aihive
      </Text>
    </Box>
  );
}
