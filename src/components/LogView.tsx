import { Box, Text } from "ink";

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
      <Text bold underline>
        Log
      </Text>
      <Box marginTop={1} flexDirection="column">
        {logs.length === 0 ? (
          <Text dimColor>No events yet</Text>
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
