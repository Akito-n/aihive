import { Box, Text } from "ink";
import { t } from "../lib/i18n.js";

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
          {t("help.start")}
        </Text>
      )}
      {state === "running" && (
        <>
          <Text>
            <Text bold color="yellow">
              [j/k]
            </Text>{" "}
            {t("help.select")}
          </Text>
          <Text>
            <Text bold color="cyan">
              [Enter/i]
            </Text>{" "}
            {t("help.sendCommand")}
          </Text>
          <Text>
            <Text bold color="blue">
              [O]
            </Text>{" "}
            {t("help.overview")}
          </Text>
          <Text>
            <Text bold color="gray">
              [L]
            </Text>{" "}
            {t("help.log")}
          </Text>
          <Text>
            <Text bold color="red">
              [x]
            </Text>{" "}
            {t("help.stop")}
          </Text>
        </>
      )}
      <Text>
        <Text bold color="gray">
          [q]
        </Text>{" "}
        {t("help.quit")}
      </Text>
    </Box>
  );
}
