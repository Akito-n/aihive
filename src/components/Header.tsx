import { Box, Text } from "ink";
import { t } from "../lib/i18n.js";
import type { AgentInfo } from "../lib/tmux.js";
import { VERSION } from "../lib/version.js";

type AppState = "idle" | "settings" | "starting" | "running" | "stopping";

const STATUS_KEYS: Record<
  AppState,
  { labelKey: Parameters<typeof t>[0]; color: string }
> = {
  idle: { labelKey: "status.idle", color: "gray" },
  settings: { labelKey: "status.settings", color: "yellow" },
  starting: { labelKey: "status.starting", color: "cyan" },
  running: { labelKey: "status.running", color: "green" },
  stopping: { labelKey: "status.stopping", color: "yellow" },
};

interface HeaderProps {
  state: AppState;
  agents: AgentInfo[];
  taskCount?: number;
  skillCount?: number;
  memoryCount?: number;
}

export function Header({
  state,
  agents,
  taskCount = 0,
  skillCount = 0,
  memoryCount = 0,
}: HeaderProps) {
  const status = STATUS_KEYS[state];

  // Model distribution summary (includes CLI prefix for non-claude)
  const modelCounts = new Map<string, number>();
  for (const a of agents) {
    const prefix = a.cli && a.cli !== "claude" ? `${a.cli}:` : "";
    const m = `${prefix}${a.model ?? "default"}`;
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
        <Text dimColor>v{VERSION}</Text>
        <Text> </Text>
        <Text bold color={status.color}>
          [{t(status.labelKey)}]
        </Text>
      </Box>
      <Text dimColor>
        {t("header.agents")}: {agents.length}
        {modelSummary ? ` (${modelSummary})` : ""} | {t("header.tasks")}:{" "}
        {taskCount}
        {skillCount > 0 ? ` | ${t("header.skills")}: ${skillCount}` : ""}
        {memoryCount > 0 ? ` | ${t("header.memory")}: ${memoryCount}` : ""} |{" "}
        {t("header.session")}: aihive
      </Text>
    </Box>
  );
}
