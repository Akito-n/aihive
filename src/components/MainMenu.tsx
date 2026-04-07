import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { t } from "../lib/i18n.js";
import type { TransKey } from "../locales/en.js";

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
  "█████╗ ██╗██╗  ██╗██╗██╗   ██╗███████╗",
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

export function MainMenu({ onSelect, agents, roleCounts = {} }: MainMenuProps) {
  const [selectedIndex, setSelectedIndex] = useState(0);

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
        borderStyle="round"
        borderColor="gray"
        paddingX={2}
        paddingY={1}
        marginBottom={1}
      >
        <Box flexDirection="column">
          {LOGO.map((line) => (
            <Text key={line} color="cyan" bold>
              {line}
            </Text>
          ))}
        </Box>
        <Box marginTop={1}>
          <Text color="yellow" bold>
            {t("mainMenu.tagline")}
          </Text>
        </Box>
      </Box>

      <Text dimColor>
        v0.1.0 | Agents: {agents}
        {Object.keys(roleCounts).length > 0 &&
          ` (${Object.entries(roleCounts)
            .map(
              ([role, count]) => `${ROLE_ICON[role] ?? "⬡"} ${count} ${role}`,
            )
            .join(", ")})`}
      </Text>

      {/* Menu */}
      <Box
        flexDirection="column"
        marginTop={1}
        borderStyle="round"
        borderColor="cyan"
        paddingX={3}
        paddingY={1}
      >
        {MENU_ITEMS.map((item, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={item.key} gap={1}>
              <Text color="cyan">{isSelected ? "▶" : " "}</Text>
              <Text bold={isSelected} color={isSelected ? item.color : "white"}>
                {t(item.labelKey).padEnd(14)}
              </Text>
              <Text
                dimColor={!isSelected}
                color={isSelected ? "gray" : undefined}
              >
                {t(item.descKey)}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Controls hint */}
      <Box marginTop={1} gap={2}>
        <Text dimColor>↑↓ {t("common.select")}</Text>
        <Text dimColor>Enter {t("common.confirm")}</Text>
      </Box>
    </Box>
  );
}
