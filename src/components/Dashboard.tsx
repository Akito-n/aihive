import { Box, Text } from "ink";
import { t, tf } from "../lib/i18n.js";
import { toSlug } from "../lib/mailbox.js";
import { formatDuration } from "../lib/report.js";
import type { Task, TaskState } from "../lib/tasks.js";
import type { AgentInfo } from "../lib/tmux.js";
import type { TransKey } from "../locales/en.js";

interface SkillCounts {
  proposed: number;
  approved: number;
  rejected: number;
}

interface DashboardProps {
  agents: AgentInfo[];
  selectedIndex: number;
  tasks?: Task[];
  stalledIds?: string[]; // tasks with no update for a while
  skillCounts?: SkillCounts;
  memoryCount?: number;
  now?: number; // for elapsed times; defaults to the render time
}

const STATUS_ICON: Record<AgentInfo["status"], string> = {
  pending: "●",
  running: "●",
  done: "●",
  error: "●",
};

const STATUS_COLOR: Record<AgentInfo["status"], string> = {
  pending: "gray",
  running: "yellow",
  done: "green",
  error: "red",
};

const ROLE_ICON: Record<string, string> = {
  orchestrator: "👑",
  coordinator: "🔗",
  worker: "🔨",
  reviewer: "🔍",
  scout: "🐝",
};

const ROLE_COLOR: Record<string, string> = {
  orchestrator: "magenta",
  coordinator: "blue",
  worker: "yellow",
  reviewer: "green",
  scout: "cyan",
};

const TASK_ICON: Record<TaskState, string> = {
  pending: "○",
  blocked: "⊘",
  running: "●",
  review: "◉",
  done: "✓",
  error: "✗",
};

/** Marks a task with no update for a while */
const STALLED_ICON = "⏱";

const STATE_LABEL: Record<TaskState, TransKey> = {
  pending: "taskState.pending",
  blocked: "taskState.blocked",
  running: "taskState.running",
  review: "taskState.review",
  done: "taskState.done",
  error: "taskState.error",
};

/** States in which a task is in an agent's hands */
const ACTIVE_STATES = new Set<TaskState>(["pending", "running", "review"]);

/** The task an agent is working on now: its most recently updated active one */
export function currentTaskOf(
  agent: AgentInfo,
  tasks: Task[],
): Task | undefined {
  const slug = toSlug(agent.name);
  return tasks
    .filter((t) => ACTIVE_STATES.has(t.state) && toSlug(t.assignedTo) === slug)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
}

/** How many tasks to list under the counts */
const TASK_LIST_LIMIT = 6;

/** Stalled tasks first, then other unfinished ones, then the most recently updated */
export function tasksToList(
  tasks: Task[],
  limit = TASK_LIST_LIMIT,
  stalledIds: string[] = [],
): Task[] {
  const finished = (t: Task) => t.state === "done";
  const stalled = (t: Task) => stalledIds.includes(t.id);
  return [...tasks]
    .sort(
      (a, b) =>
        Number(finished(a)) - Number(finished(b)) ||
        Number(stalled(b)) - Number(stalled(a)) ||
        b.updatedAt.localeCompare(a.updatedAt),
    )
    .slice(0, limit);
}

const TASK_COLOR: Record<TaskState, string> = {
  pending: "gray",
  blocked: "magenta",
  running: "yellow",
  review: "cyan",
  done: "green",
  error: "red",
};

export function Dashboard({
  agents,
  selectedIndex,
  tasks = [],
  stalledIds = [],
  skillCounts,
  memoryCount = 0,
  now = Date.now(),
}: DashboardProps) {
  return (
    <Box flexDirection="column">
      <Text bold underline>
        {t("dashboard.agents")}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {agents.map((agent, i) => {
          const isSelected = i === selectedIndex;
          const roleIcon = ROLE_ICON[agent.role] ?? "⬡";
          const roleColor = ROLE_COLOR[agent.role] ?? "white";
          const current = currentTaskOf(agent, tasks);
          const stalled = current && stalledIds.includes(current.id);
          return (
            <Box key={agent.name} flexDirection="column">
              <Box gap={1}>
                <Text color="cyan">{isSelected ? "▶" : " "}</Text>
                <Text>{roleIcon}</Text>
                <Text color={STATUS_COLOR[agent.status]}>
                  {STATUS_ICON[agent.status]}
                </Text>
                <Text
                  color={isSelected ? "cyan" : roleColor}
                  bold={isSelected || agent.role !== "worker"}
                >
                  {agent.name}
                </Text>
                {agent.model && (
                  <Text dimColor>
                    [
                    {agent.cli && agent.cli !== "claude" ? `${agent.cli}:` : ""}
                    {agent.model}]
                  </Text>
                )}
              </Box>
              <Box marginLeft={5}>
                {current ? (
                  <Text wrap="truncate-end">
                    <Text color={stalled ? "red" : TASK_COLOR[current.state]}>
                      {stalled ? STALLED_ICON : "└"} {current.id}
                    </Text>{" "}
                    <Text
                      color={stalled ? "red" : undefined}
                      dimColor={!stalled}
                    >
                      {formatDuration(now - Date.parse(current.updatedAt))}
                    </Text>{" "}
                    <Text dimColor>{current.description}</Text>
                  </Text>
                ) : (
                  <Text dimColor>└ {t("dashboard.noTask")}</Text>
                )}
              </Box>
            </Box>
          );
        })}
      </Box>

      {tasks.length > 0 &&
        (() => {
          const counts: Partial<Record<TaskState, number>> = {};
          for (const t of tasks) {
            counts[t.state] = (counts[t.state] ?? 0) + 1;
          }
          const entries = (
            Object.entries(counts) as [TaskState, number][]
          ).filter(([, c]) => c > 0);
          return (
            <Box marginTop={1} flexDirection="column">
              <Text bold underline>
                {t("dashboard.tasks")}
              </Text>
              <Box marginTop={1} columnGap={2} flexWrap="wrap">
                {entries.map(([state, count]) => (
                  <Text key={state} color={TASK_COLOR[state]}>
                    {TASK_ICON[state]} {count} {t(STATE_LABEL[state])}
                  </Text>
                ))}
                {stalledIds.length > 0 && (
                  <Text color="red" bold>
                    {STALLED_ICON}{" "}
                    {tf("dashboard.stalled", { count: stalledIds.length })}
                  </Text>
                )}
              </Box>
              <Box marginTop={1} flexDirection="column">
                {tasksToList(tasks, TASK_LIST_LIMIT, stalledIds).map((task) => (
                  <Box key={task.id} gap={1}>
                    {stalledIds.includes(task.id) ? (
                      <Text color="red">{STALLED_ICON}</Text>
                    ) : (
                      <Text color={TASK_COLOR[task.state]}>
                        {TASK_ICON[task.state]}
                      </Text>
                    )}
                    <Text wrap="truncate-end">{task.id}</Text>
                    <Text dimColor wrap="truncate-end">
                      {task.assignedTo}
                    </Text>
                  </Box>
                ))}
                {tasks.length > TASK_LIST_LIMIT && (
                  <Text dimColor>
                    {tf("dashboard.more", {
                      count: tasks.length - TASK_LIST_LIMIT,
                    })}
                  </Text>
                )}
              </Box>
            </Box>
          );
        })()}

      {skillCounts &&
        (skillCounts.approved > 0 || skillCounts.proposed > 0) && (
          <Box marginTop={1} flexDirection="column">
            <Text bold underline>
              {t("dashboard.skills")}
            </Text>
            <Box marginTop={1} gap={2}>
              {skillCounts.approved > 0 && (
                <Text color="green">
                  ✓{" "}
                  {tf("dashboard.skillsApproved", {
                    count: skillCounts.approved,
                  })}
                </Text>
              )}
              {skillCounts.proposed > 0 && (
                <Text color="yellow">
                  ○{" "}
                  {tf("dashboard.skillsPending", {
                    count: skillCounts.proposed,
                  })}
                </Text>
              )}
            </Box>
          </Box>
        )}

      {memoryCount > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold underline>
            {t("dashboard.memory")}
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">
              🧠 {tf("dashboard.memoryEntries", { count: memoryCount })}
            </Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
