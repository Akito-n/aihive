import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { t, tf } from "../lib/i18n.js";
import type { TransKey } from "../locales/en.js";

interface LogViewProps {
  logs: string[];
  height?: number; // rows available for log lines
  onClose?: () => void;
}

export type LogKind = "message" | "task" | "warning" | "other";
export type LogFilter = "all" | Exclude<LogKind, "other">;

const FILTERS: LogFilter[] = ["all", "message", "task", "warning"];

const FILTER_LABEL: Record<LogFilter, TransKey> = {
  all: "log.filter.all",
  message: "log.filter.message",
  task: "log.filter.task",
  warning: "log.filter.warning",
};

const ROLE_LOG_COLOR: Record<string, string> = {
  orchestrator: "magenta",
  coordinator: "blue",
  reviewer: "green",
  scout: "cyan",
};

/** What a log line is about, from the wording App uses for it */
export function logKind(log: string): LogKind {
  const body = log.replace(/^\d{1,2}:\d{2}\s+/, "");
  const isMessage =
    (body.startsWith("[") && body.includes("→")) ||
    body.startsWith("→ ") ||
    body.startsWith("⚡ ");
  if (isMessage) {
    // An agent's error report is worth noticing; other text is its own words
    return /^\[[^\]]*\] error:/.test(body) ? "warning" : "message";
  }
  if (/^(Error|Invalid|Could not)\b|\b(failed|stalled)\b/.test(body)) {
    return "warning";
  }
  if (/^(Task|Checks|Running checks|Completion report)\b/.test(body)) {
    return "task";
  }
  return "other";
}

export function filterLogs(logs: string[], filter: LogFilter): string[] {
  return filter === "all" ? logs : logs.filter((l) => logKind(l) === filter);
}

function getLogColor(log: string): string | undefined {
  if (logKind(log) === "warning") return "red";
  // Match [from → to] pattern to detect role
  const match = log.match(/\[(\S+)\s*→/);
  if (match) {
    const from = match[1].toLowerCase();
    for (const [role, color] of Object.entries(ROLE_LOG_COLOR)) {
      if (from.includes(role)) return color;
    }
    // Workers default to yellow
    if (from.includes("worker")) return "yellow";
  }
  return undefined;
}

/**
 * Log screen: follows the newest lines until scrolled up; j/k and
 * PgUp/PgDn scroll, g/G jump to the oldest/newest, f filters.
 */
export function LogView({ logs, height = 20, onClose }: LogViewProps) {
  const [filter, setFilter] = useState<LogFilter>("all");
  // Lines scrolled up from the newest; 0 follows new lines as they come
  const [fromEnd, setFromEnd] = useState(0);

  const shown = filterLogs(logs, filter);
  const pageSize = Math.max(3, height - 3);
  const maxFromEnd = Math.max(0, shown.length - pageSize);
  const offset = Math.min(fromEnd, maxFromEnd);
  const end = shown.length - offset;
  const start = Math.max(0, end - pageSize);
  const visible = shown
    .slice(start, end)
    .map((log, n) => ({ log, pos: start + n }));

  useInput(
    (input, key) => {
      if (key.escape || input === "L" || input === "q") {
        onClose?.();
        return;
      }
      const clamp = (n: number) => Math.max(0, Math.min(maxFromEnd, n));
      if (key.upArrow || input === "k") {
        setFromEnd((n) => clamp(Math.min(n, maxFromEnd) + 1));
      } else if (key.downArrow || input === "j") {
        setFromEnd((n) => clamp(Math.min(n, maxFromEnd) - 1));
      } else if (key.pageUp) {
        setFromEnd((n) => clamp(Math.min(n, maxFromEnd) + pageSize));
      } else if (key.pageDown) {
        setFromEnd((n) => clamp(Math.min(n, maxFromEnd) - pageSize));
      } else if (input === "g") {
        setFromEnd(maxFromEnd);
      } else if (input === "G") {
        setFromEnd(0);
      } else if (input === "f") {
        setFilter(FILTERS[(FILTERS.indexOf(filter) + 1) % FILTERS.length]);
        setFromEnd(0);
      }
    },
    { isActive: Boolean(onClose) },
  );

  return (
    <Box flexDirection="column">
      <Box marginBottom={1} gap={2}>
        <Text bold color="gray">
          {"📋 Log"}
        </Text>
        {FILTERS.map((f) => (
          <Text
            key={f}
            color={f === filter ? "cyan" : undefined}
            bold={f === filter}
            dimColor={f !== filter}
          >
            {t(FILTER_LABEL[f])}
          </Text>
        ))}
        <Text dimColor>
          {shown.length} {t("log.entries")}
          {offset > 0 ? ` ${tf("log.scrolled", { count: offset })}` : ""}
        </Text>
      </Box>

      <Box flexDirection="column" height={pageSize} overflow="hidden">
        {visible.length === 0 ? (
          <Text dimColor>{t("log.noEvents")}</Text>
        ) : (
          visible.map(({ log, pos }) => {
            const color = getLogColor(log);
            return (
              <Text
                key={pos}
                color={color}
                dimColor={!color}
                wrap="truncate-end"
              >
                {log}
              </Text>
            );
          })
        )}
      </Box>

      <Box marginTop={1}>
        <Text dimColor>{t("log.help")}</Text>
      </Box>
    </Box>
  );
}
