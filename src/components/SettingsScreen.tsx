import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type { AihiveConfig } from "../lib/config.js";
import { t } from "../lib/i18n.js";
import { AgentEditor } from "./AgentEditor.js";
import { CharacterScreen } from "./CharacterScreen.js";
import { LanguageScreen } from "./LanguageScreen.js";
import { QuickCommandEditor } from "./QuickCommandEditor.js";

interface SettingsScreenProps {
  config: AihiveConfig;
  onSave: (config: AihiveConfig) => void;
  onBack: () => void;
}

interface MenuItem {
  key: string;
  labelKey: string;
  descKey: string;
  color: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: "agents",
    labelKey: "settings.agentNames",
    descKey: "settings.agentNames.desc",
    color: "cyan",
  },
  {
    key: "commands",
    labelKey: "settings.quickCommands",
    descKey: "settings.quickCommands.desc",
    color: "yellow",
  },
  {
    key: "character",
    labelKey: "settings.character",
    descKey: "settings.character.desc",
    color: "magenta",
  },
  {
    key: "language",
    labelKey: "settings.language",
    descKey: "settings.language.desc",
    color: "green",
  },
  {
    key: "back",
    labelKey: "settings.back",
    descKey: "settings.back.desc",
    color: "gray",
  },
];

type SettingsView = "menu" | "agents" | "commands" | "character" | "language";

export function SettingsScreen({
  config,
  onSave,
  onBack,
}: SettingsScreenProps) {
  const [view, setView] = useState<SettingsView>("menu");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useInput(
    (_input, key) => {
      if (key.upArrow) {
        setSelectedIndex(
          (prev) => (prev - 1 + MENU_ITEMS.length) % MENU_ITEMS.length,
        );
      }
      if (key.downArrow) {
        setSelectedIndex((prev) => (prev + 1) % MENU_ITEMS.length);
      }
      if (key.return) {
        const item = MENU_ITEMS[selectedIndex];
        if (item.key === "agents") {
          setView("agents");
        } else if (item.key === "commands") {
          setView("commands");
        } else if (item.key === "character") {
          setView("character");
        } else if (item.key === "language") {
          setView("language");
        } else if (item.key === "back") {
          onBack();
        }
      }
      if (key.escape) {
        onBack();
      }
    },
    { isActive: view === "menu" },
  );

  if (view === "agents") {
    return (
      <AgentEditor
        config={config}
        onSave={(updated) => {
          onSave(updated);
          setView("menu");
        }}
        onCancel={() => setView("menu")}
      />
    );
  }

  if (view === "commands") {
    return <QuickCommandEditor onBack={() => setView("menu")} />;
  }

  if (view === "character") {
    return <CharacterScreen onBack={() => setView("menu")} />;
  }

  if (view === "language") {
    return <LanguageScreen onBack={() => setView("menu")} />;
  }

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={3}
        paddingY={1}
      >
        <Text bold color="yellow">
          {t("settings.title")}
        </Text>
      </Box>

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
                {t(item.labelKey as import("../locales/en.js").TransKey).padEnd(
                  16,
                )}
              </Text>
              <Text
                dimColor={!isSelected}
                color={isSelected ? "gray" : undefined}
              >
                {t(item.descKey as import("../locales/en.js").TransKey)}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} gap={2}>
        <Text dimColor>↑↓ {t("common.select")}</Text>
        <Text dimColor>Enter {t("common.confirm")}</Text>
        <Text dimColor>Esc {t("common.back")}</Text>
      </Box>
    </Box>
  );
}
