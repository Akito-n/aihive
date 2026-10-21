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
      ["Enter", "retro.cmd.talk"],
      ["T", "retro.cmd.quests"],
      ["O", "retro.cmd.overview"],
      ["L", "retro.cmd.log"],
      ["S", "retro.cmd.status"],
      ["E", "retro.cmd.equip"],
      ["G", "retro.cmd.shop"],
      ["x", "retro.cmd.stop"],
      // Newer screens last, so stop stays in view on narrow terminals
      ["Z", "retro.cmd.codex"],
      ["M", "retro.cmd.map"],
      ["D", "retro.cmd.direct"],
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
        <Box columnGap={2} height={1} overflow="hidden">
          {retroCommands(state).map(([key, label]) => (
            // Commands keep their width; the ones that do not fit are cut off
            <Box key={key} flexShrink={0}>
              <Text>
                {t(label)} <Text dimColor>{key}</Text>
              </Text>
            </Box>
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
            <Text bold color="yellow">
              [S]
            </Text>{" "}
            {t("help.status")}
          </Text>
          <Text>
            <Text bold color="yellow">
              [E]
            </Text>{" "}
            {t("help.equip")}
          </Text>
          <Text>
            <Text bold color="yellow">
              [Z]
            </Text>{" "}
            {t("help.codex")}
          </Text>
          <Text>
            <Text bold color="yellow">
              [M]
            </Text>{" "}
            {t("help.map")}
          </Text>
          <Text>
            <Text bold color="yellow">
              [G]
            </Text>{" "}
            {t("help.shop")}
          </Text>
          <Text>
            <Text bold color="magenta">
              [D]
            </Text>{" "}
            {t("help.direct")}
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
