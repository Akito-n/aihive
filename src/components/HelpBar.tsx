import { Box, Text } from "ink";

interface HelpBarProps {
  state: "idle" | "settings" | "starting" | "running" | "stopping";
}

export function HelpBar({ state }: HelpBarProps) {
  return (
    <Box gap={2}>
      {state === "idle" && (
        <Text>
          <Text bold color="green">
            [s]
          </Text>{" "}
          Start
        </Text>
      )}
      {state === "running" && (
        <>
          <Text>
            <Text bold color="yellow">
              [j/k]
            </Text>{" "}
            Select
          </Text>
          <Text>
            <Text bold color="cyan">
              [Enter/i]
            </Text>{" "}
            Send command
          </Text>
          <Text>
            <Text bold color="blue">
              [O]
            </Text>{" "}
            Overview
          </Text>
          <Text>
            <Text bold color="gray">
              [L]
            </Text>{" "}
            Log
          </Text>
          <Text>
            <Text bold color="red">
              [x]
            </Text>{" "}
            Stop
          </Text>
        </>
      )}
      <Text>
        <Text bold color="gray">
          [q]
        </Text>{" "}
        Quit
      </Text>
    </Box>
  );
}
