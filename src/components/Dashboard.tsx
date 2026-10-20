import { Box, Text } from "ink";
import type { Task, TaskState } from "../lib/tasks.js";
import type { AgentInfo } from "../lib/tmux.js";

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
}: DashboardProps) {
  return (
    <Box flexDirection="column">
      <Text bold underline>
        Agents
      </Text>
      <Box marginTop={1} flexDirection="column">
        {agents.map((agent, i) => {
          const isSelected = i === selectedIndex;
          const roleIcon = ROLE_ICON[agent.role] ?? "⬡";
          const roleColor = ROLE_COLOR[agent.role] ?? "white";
          return (
            <Box key={agent.name} gap={1}>
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
                  [{agent.cli && agent.cli !== "claude" ? `${agent.cli}:` : ""}
                  {agent.model}]
                </Text>
              )}
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
                Tasks
              </Text>
              <Box marginTop={1} gap={2} flexWrap="wrap">
                {entries.map(([state, count]) => (
                  <Text key={state} color={TASK_COLOR[state]}>
                    {TASK_ICON[state]} {count} {state}
                  </Text>
                ))}
                {stalledIds.length > 0 && (
                  <Text color="red" bold>
                    {STALLED_ICON} {stalledIds.length} stalled
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
                  <Text dimColor>+{tasks.length - TASK_LIST_LIMIT} more</Text>
                )}
              </Box>
            </Box>
          );
        })()}

      {skillCounts &&
        (skillCounts.approved > 0 || skillCounts.proposed > 0) && (
          <Box marginTop={1} flexDirection="column">
            <Text bold underline>
              Skills
            </Text>
            <Box marginTop={1} gap={2}>
              {skillCounts.approved > 0 && (
                <Text color="green">✓ {skillCounts.approved} approved</Text>
              )}
              {skillCounts.proposed > 0 && (
                <Text color="yellow">○ {skillCounts.proposed} pending</Text>
              )}
            </Box>
          </Box>
        )}

      {memoryCount > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold underline>
            Memory
          </Text>
          <Box marginTop={1}>
            <Text color="cyan">🧠 {memoryCount} entries</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
