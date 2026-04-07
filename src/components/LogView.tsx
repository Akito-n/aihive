import { Box, Text } from "ink";
import { t } from "../lib/i18n.js";

interface LogViewProps {
  logs: string[];
}

const ROLE_LOG_COLOR: Record<string, string> = {
  orchestrator: "magenta",
  coordinator: "blue",
  reviewer: "green",
  scout: "cyan",
};

function getLogColor(log: string): string | undefined {
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

export function LogView({ logs }: LogViewProps) {
  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="gray">
          {"📋 Log"}
        </Text>
        <Text dimColor>
          {" "}
          — {logs.length} {t("log.entries")} |{" "}
        </Text>
        <Text bold color="yellow">
          [L]
        </Text>
        <Text dimColor> {t("log.close")}</Text>
      </Box>

      <Box flexDirection="column">
        {logs.length === 0 ? (
          <Text dimColor>{t("log.noEvents")}</Text>
        ) : (
          logs.map((log, i) => {
            const color = getLogColor(log);
            return (
              <Text key={i} color={color} dimColor={!color}>
                {log}
              </Text>
            );
          })
        )}
      </Box>
    </Box>
  );
}
