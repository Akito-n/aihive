import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { t } from "../lib/i18n.js";
import { frameStyle, isRetro, jobKeyOf } from "../lib/theme.js";
import { VERSION } from "../lib/version.js";
import type { TransKey } from "../locales/en.js";
import { PixelLogo } from "./PixelLogo.js";
import { useBlink, Window } from "./Window.js";

interface MenuItem {
  key: string;
  labelKey: TransKey;
  descKey: TransKey;
  color: string;
}

interface MainMenuProps {
  onSelect: (key: string) => void;
  agents: number;
  roleCounts?: Record<string, number>;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: "start",
    labelKey: "mainMenu.startAgents",
    descKey: "mainMenu.startAgents.desc",
    color: "green",
  },
  {
    key: "config",
    labelKey: "mainMenu.settings",
    descKey: "mainMenu.settings.desc",
    color: "yellow",
  },
  {
    key: "quit",
    labelKey: "mainMenu.quit",
    descKey: "mainMenu.quit.desc",
    color: "red",
  },
];

const LOGO = [
  " █████╗ ██╗██╗  ██╗██╗██╗   ██╗███████╗",
  "██╔══██╗██║██║  ██║██║██║   ██║██╔════╝",
  "███████║██║███████║██║██║   ██║█████╗  ",
  "██╔══██║██║██╔══██║██║╚██╗ ██╔╝██╔══╝  ",
  "██║  ██║██║██║  ██║██║ ╚████╔╝ ███████╗",
  "╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝",
];

const ROLE_ICON: Record<string, string> = {
  orchestrator: "👑",
  coordinator: "🔗",
  worker: "🔨",
  reviewer: "🔍",
  scout: "🐝",
};

/** "Agents: 6 (👑 1 orchestrator, …)", or the party by job in the retro look */
export function partySummary(
  agents: number,
  roleCounts: Record<string, number>,
  retro: boolean,
): string {
  const roles = Object.entries(roleCounts);
  if (retro) {
    const party = roles
      .map(([role, count]) => {
        const jobKey = jobKeyOf(role);
        return `${jobKey ? t(jobKey) : role} ${count}`;
      })
      .join("  ");
    return `${t("retro.party")}: ${agents}${party ? `  ${party}` : ""}`;
  }
  return `Agents: ${agents}${
    roles.length > 0
      ? ` (${roles
          .map(([role, count]) => `${ROLE_ICON[role] ?? "⬡"} ${count} ${role}`)
          .join(", ")})`
      : ""
  }`;
}

export function MainMenu({ onSelect, agents, roleCounts = {} }: MainMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const retro = isRetro();
  const blink = useBlink();

  useInput((_input, key) => {
    if (key.upArrow) {
      setSelectedIndex(
        (prev) => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length,
      );
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => (prev + 1) % MENU_ITEMS.length);
    }
    if (key.return) {
      onSelect(MENU_ITEMS[selectedIndex].key);
    }
  });

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      {/* Logo */}
      <Box
        flexDirection="column"
        alignItems="center"
        {...(retro
          ? frameStyle()
          : { borderStyle: "round", borderColor: "gray" })}
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        {retro ? (
          <PixelLogo />
        ) : (
          <Box flexDirection="column">
            {LOGO.map((line) => (
              <Text key={line} color="cyan" bold>
                {line}
              </Text>
            ))}
          </Box>
        )}
        <Text dimColor>v{VERSION}</Text>
        <Box marginTop={1}>
          <Text color="yellow" bold>
            {t("mainMenu.tagline")}
          </Text>
        </Box>
      </Box>

      <Text dimColor>{partySummary(agents, roleCounts, retro)}</Text>

      {/* Menu */}
      <Window
        title={retro ? t("retro.commands") : undefined}
        {...(retro ? {} : { borderColor: "cyan" })}
        marginTop={1}
        paddingX={3}
        paddingY={1}
      >
        {MENU_ITEMS.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={item.key} gap={1}>
              <Text color={retro ? "white" : "cyan"}>
                {isSelected && (blink || !retro) ? "▶" : " "}
              </Text>
              <Box width={18} flexShrink={0}>
                <Text
                  bold={isSelected}
                  color={isSelected && !retro ? item.color : "white"}
                >
                  {t(item.labelKey)}
                </Text>
              </Box>
              <Text
                dimColor={!isSelected}
                color={isSelected ? "gray" : undefined}
              >
                {t(item.descKey)}
              </Text>
            </Box>
          );
        })}
      </Window>

      {/* Controls hint */}
      <Box marginTop={1} gap={2}>
        <Text dimColor>↑↓ {t("common.select")}</Text>
        <Text dimColor>Enter {t("common.confirm")}</Text>
      </Box>
    </Box>
  );
}
