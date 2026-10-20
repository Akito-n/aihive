import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { t, tf } from "../lib/i18n.js";
import { formatDuration, type TaskCheck } from "../lib/report.js";
import type { Task, TaskState } from "../lib/tasks.js";
import type { TransKey } from "../locales/en.js";

// ─── Types ───────────────────────────────────────────────────────────

export type TaskFilter = "all" | "open" | "done" | "error";

const FILTERS: TaskFilter[] = ["all", "open", "done", "error"];

interface TaskViewProps {
  tasks: Task[];
  stalledIds?: string[];
  checks?: ReadonlyMap<string, TaskCheck>;
  height: number; // rows available for the list and the detail
  onClose: () => void;
}

const TASK_ICON: Record<TaskState, string> = {
  pending: "○",
  blocked: "⊘",
  running: "●",
  review: "◉",
  done: "✓",
  error: "✗",
};

const TASK_COLOR: Record<TaskState, string> = {
  pending: "gray",
  blocked: "magenta",
  running: "yellow",
  review: "cyan",
  done: "green",
  error: "red",
};

const STATE_LABEL: Record<TaskState, TransKey> = {
  pending: "taskState.pending",
  blocked: "taskState.blocked",
  running: "taskState.running",
  review: "taskState.review",
  done: "taskState.done",
  error: "taskState.error",
};

const STALLED_ICON = "⏱";

// ─── Helpers ─────────────────────────────────────────────────────────

/** Tasks matching the filter: unfinished first (stalled on top), then by age */
export function visibleTasks(
  tasks: Task[],
  filter: TaskFilter,
  stalledIds: string[] = [],
): Task[] {
  const finished = (t: Task) => t.state === "done" || t.state === "error";
  const stalled = (t: Task) => stalledIds.includes(t.id);
  return tasks
    .filter((t) =>
      filter === "all"
        ? true
        : filter === "open"
          ? !finished(t)
          : t.state === filter,
    )
    .sort(
      (a, b) =>
        Number(finished(a)) - Number(finished(b)) ||
        Number(stalled(b)) - Number(stalled(a)) ||
        a.createdAt.localeCompare(b.createdAt),
    );
}

function clock(iso: string): string {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface DetailLine {
  row?: number; // position in the detail, used as the React key
  text: string;
  color?: string;
  bold?: boolean;
  dim?: boolean;
}

/** Lines of the detail pane for one task */
export function detailLines(
  task: Task,
  check: TaskCheck | undefined,
  stalled: boolean,
): DetailLine[] {
  const lines: DetailLine[] = [
    {
      text: `${TASK_ICON[task.state]} ${task.id}  ${t(STATE_LABEL[task.state])}${stalled ? `  ${STALLED_ICON} ${t("taskView.stalled")}` : ""}`,
      color: stalled ? "red" : TASK_COLOR[task.state],
      bold: true,
    },
    { text: tf("taskView.assignee", { name: task.assignedTo }) },
  ];
  if (task.blockedBy.length > 0) {
    lines.push({
      text: tf("taskView.blockedBy", { ids: task.blockedBy.join(", ") }),
    });
  }
  lines.push({
    text: tf("taskView.times", {
      created: clock(task.createdAt),
      updated: clock(task.updatedAt),
      duration: formatDuration(
        Date.parse(task.updatedAt) - Date.parse(task.createdAt),
      ),
    }),
    dim: true,
  });
  if (check) {
    lines.push(
      check.passed
        ? {
            text: tf("taskView.checksPassed", { commit: check.commit ?? "-" }),
            color: "green",
          }
        : {
            text: tf("taskView.checksFailed", {
              command: check.failedCommand ?? "-",
            }),
            color: "red",
          },
    );
  }

  const section = (title: TransKey, body: string | undefined) => {
    lines.push({ text: " " }, { text: t(title), bold: true });
    const text = (body ?? "").trim();
    if (!text) {
      lines.push({ text: t("taskView.none"), dim: true });
      return;
    }
    for (const l of text.split("\n")) lines.push({ text: l || " " });
  };
  section("taskView.request", task.request ?? task.description);
  section("taskView.result", task.result);
  return lines.map((line, row) => ({ ...line, row }));
}

// ─── Component ───────────────────────────────────────────────────────

/** Full-screen task list with the selected task's request, result and checks */
export function TaskView({
  tasks,
  stalledIds = [],
  checks,
  height,
  onClose,
}: TaskViewProps) {
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [selected, setSelected] = useState(0);
  const [scroll, setScroll] = useState(0);

  const list = visibleTasks(tasks, filter, stalledIds);
  const index = Math.min(selected, Math.max(0, list.length - 1));
  const task = list[index];
  const lines = task
    ? detailLines(task, checks?.get(task.id), stalledIds.includes(task.id))
    : [];
  const bodyHeight = Math.max(5, height - 4);
  // One row goes to the scroll position when the detail does not fit
  const pageSize = lines.length > bodyHeight ? bodyHeight - 1 : bodyHeight;
  const maxScroll = Math.max(0, lines.length - pageSize);
  const offset = Math.min(scroll, maxScroll);

  // Keep the selected row on screen
  const listStart = Math.max(
    0,
    Math.min(index - bodyHeight + 1, list.length - bodyHeight),
  );
  const shown = list.slice(listStart, listStart + bodyHeight);

  useInput((input, key) => {
    if (key.escape || input === "T" || input === "q") {
      onClose();
      return;
    }
    if (key.upArrow || input === "k") {
      setSelected(Math.max(0, index - 1));
      setScroll(0);
      return;
    }
    if (key.downArrow || input === "j") {
      setSelected(Math.min(list.length - 1, index + 1));
      setScroll(0);
      return;
    }
    if (input === "f") {
      setFilter(FILTERS[(FILTERS.indexOf(filter) + 1) % FILTERS.length]);
      setSelected(0);
      setScroll(0);
      return;
    }
    if (input === "J" || key.pageDown) {
      const step = key.pageDown ? pageSize : 1;
      setScroll((s) => Math.min(maxScroll, Math.min(s, maxScroll) + step));
      return;
    }
    if (input === "K" || key.pageUp) {
      const step = key.pageUp ? pageSize : 1;
      setScroll((s) => Math.max(0, Math.min(s, maxScroll) - step));
    }
  });

  return (
    <Box flexDirection="column" flexGrow={1}>
      <Box gap={2}>
        <Text bold underline>
          {t("taskView.title")}
        </Text>
        {FILTERS.map((f) => (
          <Text
            key={f}
            color={f === filter ? "cyan" : undefined}
            bold={f === filter}
            dimColor={f !== filter}
          >
            {t(`taskView.filter.${f}`)}
          </Text>
        ))}
        <Text dimColor>
          {tf("taskView.count", { shown: list.length, total: tasks.length })}
        </Text>
      </Box>

      <Box marginTop={1} flexGrow={1}>
        <Box flexDirection="column" width={36} marginRight={1}>
          {list.length === 0 ? (
            <Text dimColor>{t("taskView.empty")}</Text>
          ) : (
            shown.map((item) => {
              const isSelected = item.id === task?.id;
              const stalled = stalledIds.includes(item.id);
              return (
                <Box key={item.id} gap={1}>
                  <Text color="cyan">{isSelected ? "▶" : " "}</Text>
                  <Text color={stalled ? "red" : TASK_COLOR[item.state]}>
                    {stalled ? STALLED_ICON : TASK_ICON[item.state]}
                  </Text>
                  <Text
                    bold={isSelected}
                    color={isSelected ? "cyan" : undefined}
                  >
                    {item.id}
                  </Text>
                  <Text dimColor wrap="truncate-end">
                    {item.description}
                  </Text>
                </Box>
              );
            })
          )}
        </Box>

        <Box
          flexDirection="column"
          flexGrow={1}
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          height={bodyHeight + 2}
          overflow="hidden"
        >
          {lines.slice(offset, offset + pageSize).map((line) => (
            <Text
              key={line.row}
              color={line.color}
              bold={line.bold}
              dimColor={line.dim}
              wrap="truncate-end"
            >
              {line.text}
            </Text>
          ))}
          {maxScroll > 0 && (
            <Text dimColor>
              {tf("taskView.scroll", {
                from: offset + 1,
                to: Math.min(lines.length, offset + pageSize),
                total: lines.length,
              })}
            </Text>
          )}
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{t("taskView.help")}</Text>
      </Box>
    </Box>
  );
}
