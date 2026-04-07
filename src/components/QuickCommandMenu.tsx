import { Box, Text, useInput } from "ink";
import { useState } from "react";
import type {
  QuickCommand,
  QuickCommandCategory,
} from "../lib/quick-commands.js";

interface QuickCommandMenuProps {
  categories: QuickCommandCategory[];
  onSelect: (command: QuickCommand) => void;
  onClose: () => void;
}

export function QuickCommandMenu({
  categories,
  onSelect,
  onClose,
}: QuickCommandMenuProps) {
  const [selectedCategory, setSelectedCategory] = useState(0);
  const [selectedCommand, setSelectedCommand] = useState(0);
  const [phase, setPhase] = useState<"category" | "command">("category");

  const currentCategory = categories[selectedCategory];
  const commands = currentCategory?.commands ?? [];

  useInput((input, key) => {
    if (key.escape) {
      if (phase === "command") {
        setPhase("category");
        setSelectedCommand(0);
      } else {
        onClose();
      }
      return;
    }

    if (phase === "category") {
      if (key.upArrow || input === "k") {
        setSelectedCategory((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedCategory((prev) =>
          Math.min(categories.length - 1, prev + 1),
        );
        return;
      }
      if (key.return) {
        if (currentCategory && currentCategory.commands.length > 0) {
          setPhase("command");
          setSelectedCommand(0);
        }
        return;
      }
    }

    if (phase === "command") {
      if (key.upArrow || input === "k") {
        setSelectedCommand((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectedCommand((prev) => Math.min(commands.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const cmd = commands[selectedCommand];
        if (cmd) {
          onSelect(cmd);
        }
        return;
      }
    }
  });

  if (categories.length === 0) {
    return (
      <Box
        flexDirection="column"
        borderStyle="single"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="yellow">
          Quick Commands
        </Text>
        <Text dimColor>
          No commands found. Add .yml files to .aihive/commands/
        </Text>
        <Text dimColor>Esc to close</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" width="100%">
      {phase === "category" ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="yellow"
          paddingX={1}
          width="100%"
        >
          <Box marginBottom={1}>
            <Text bold color="yellow">
              Quick Commands
            </Text>
          </Box>
          {categories.map((cat, i) => {
            const isSelected = i === selectedCategory;
            return (
              <Box key={cat.name}>
                <Text
                  color={isSelected ? "yellow" : undefined}
                  bold={isSelected}
                >
                  {isSelected ? "▶ " : "  "}
                  {cat.name}
                </Text>
                <Text dimColor> ({cat.commands.length})</Text>
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>↑↓ select Enter open Esc close</Text>
          </Box>
        </Box>
      ) : (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="cyan"
          paddingX={1}
          width="100%"
        >
          <Box marginBottom={1}>
            <Text bold color="cyan">
              {currentCategory?.name ?? ""}
            </Text>
          </Box>
          {commands.map((cmd, i) => {
            const isSelected = i === selectedCommand;
            return (
              <Box key={cmd.name} flexDirection="column">
                <Box>
                  <Text
                    color={isSelected ? "cyan" : undefined}
                    bold={isSelected}
                  >
                    {isSelected ? "▶ " : "  "}
                    {cmd.name}
                  </Text>
                </Box>
                {isSelected && cmd.description && (
                  <Box paddingLeft={4}>
                    <Text dimColor>{cmd.description}</Text>
                  </Box>
                )}
              </Box>
            );
          })}
          <Box marginTop={1}>
            <Text dimColor>↑↓ select Enter cast Esc back</Text>
          </Box>
        </Box>
      )}
    </Box>
  );
}
