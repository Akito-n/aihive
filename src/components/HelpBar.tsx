import { Box, Text } from "ink";
import { t } from "../lib/i18n.js";
import type { RpgMessage } from "../lib/rpg-messages.js";
import { isRetro } from "../lib/theme.js";
import type { TransKey } from "../locales/en.js";
import { Window } from "./Window.js";

interface HelpBarProps {
  state: "idle" | "settings" | "starting" | "running" | "stopping";
  /** Latest story line, shown above the commands in the retro look */
  message?: RpgMessage;
}

/** Keys in the retro command window, by app state */
export function retroCommands(
  state: HelpBarProps["state"],
): [string, TransKey][] {
  const commands: [string, TransKey][] = [];
  if (state === "idle") commands.push(["s", "retro.cmd.start"]);
  if (state === "running") {
    commands.push(
      ["j/k", "retro.cmd.select"],
      ["Enter", "retro.cmd.talk"],
      ["T", "retro.cmd.quests"],
      ["O", "retro.cmd.overview"],
      ["L", "retro.cmd.log"],
      ["x", "retro.cmd.stop"],
    );
  }
  commands.push(["q", "retro.cmd.quit"]);
  return commands;
}

export function HelpBar({ state, message }: HelpBarProps) {
  if (isRetro()) {
    return (
      <Window title={t("retro.commands")} flexGrow={1}>
        <Text wrap="truncate-end" color={message?.color}>
          {message ? `＊「${message.text}` : " "}
        </Text>
        <Box columnGap={3} flexWrap="wrap">
          {retroCommands(state).map(([key, label]) => (
            <Text key={key}>
              {t(label)} <Text dimColor>{key}</Text>
            </Text>
          ))}
        </Box>
      </Window>
    );
  }
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
            <Text bold color="cyan">
              [T]
            </Text>{" "}
            {t("help.tasks")}
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
