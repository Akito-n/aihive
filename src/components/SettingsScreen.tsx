import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import { AgentEditor } from "./AgentEditor.js";
import { QuickCommandEditor } from "./QuickCommandEditor.js";
import type { AihiveConfig } from "../lib/config.js";

interface SettingsScreenProps {
  config: AihiveConfig;
  onSave: (config: AihiveConfig) => void;
  onBack: () => void;
}

interface MenuItem {
  key: string;
  label: string;
  description: string;
  color: string;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: "agents",
    label: "Agent Names",
    description: "Edit agent names and roles",
    color: "cyan",
  },
  {
    key: "commands",
    label: "Quick Commands",
    description: "Edit // quick commands",
    color: "yellow",
  },
  {
    key: "back",
    label: "Back",
    description: "Return to main menu",
    color: "gray",
  },
];

type SettingsView = "menu" | "agents" | "commands";

export function SettingsScreen({ config, onSave, onBack }: SettingsScreenProps) {
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
          Settings
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
              <Text
                bold={isSelected}
                color={isSelected ? item.color : "white"}
              >
                {item.label.padEnd(16)}
              </Text>
              <Text
                dimColor={!isSelected}
                color={isSelected ? "gray" : undefined}
              >
                {item.description}
              </Text>
            </Box>
          );
        })}
      </Box>

      <Box marginTop={1} gap={2}>
        <Text dimColor>↑↓ Select</Text>
        <Text dimColor>Enter Confirm</Text>
        <Text dimColor>Esc Back</Text>
      </Box>
    </Box>
  );
}
