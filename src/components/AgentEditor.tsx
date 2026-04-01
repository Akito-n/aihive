import React, { useState } from "react";
import { Box, Text, useInput } from "ink";
import type { AgentConfig, AihiveConfig } from "../lib/config.js";
import { resolveWindowLayout } from "../lib/config.js";
import { getCliKeys, getCliModels } from "../lib/cli-registry.js";

interface AgentEditorProps {
  config: AihiveConfig;
  onSave: (config: AihiveConfig) => void;
  onCancel: () => void;
}

type EditMode = "list" | "edit-field" | "select-option";
type EditField = "name" | "role" | "cli" | "model";

const FIELDS: { key: EditField; label: string }[] = [
  { key: "name", label: "Name" },
  { key: "role", label: "Role" },
  { key: "cli", label: "CLI" },
  { key: "model", label: "Model" },
];

const ROLE_OPTIONS = ["orchestrator", "coordinator", "worker", "reviewer", "scout"];
const CLI_OPTIONS = getCliKeys();

/** Get the select options for a field, considering the agent's CLI for model */
function getSelectOptions(field: EditField, agent: AgentConfig): string[] | undefined {
  if (field === "role") return ROLE_OPTIONS;
  if (field === "cli") return CLI_OPTIONS;
  if (field === "model") return getCliModels(agent.cli ?? "claude");
  return undefined;
}

export function AgentEditor({ config, onSave, onCancel }: AgentEditorProps) {
  const [agents, setAgents] = useState<AgentConfig[]>(() =>
    config.agents.map((a) => ({ ...a })),
  );
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedCol, setSelectedCol] = useState(0);
  const [mode, setMode] = useState<EditMode>("list");
  const [editValue, setEditValue] = useState("");
  const [editCursor, setEditCursor] = useState(0);
  const [selectIndex, setSelectIndex] = useState(0);
  const [selectOptions, setSelectOptions] = useState<string[]>([]);

  // Extra row for "Add Agent" and "Delete" actions
  const totalRows = agents.length + 2; // agents + [Add Agent] + [Save & Back]

  useInput(
    (input, key) => {
      if (key.escape) {
        onCancel();
        return;
      }
      if (key.upArrow) {
        setSelectedRow((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedRow((prev) => Math.min(totalRows - 1, prev + 1));
        return;
      }
      if (key.leftArrow) {
        if (selectedRow < agents.length) {
          setSelectedCol((prev) => Math.max(0, prev - 1));
        }
        return;
      }
      if (key.rightArrow) {
        if (selectedRow < agents.length) {
          setSelectedCol((prev) => Math.min(FIELDS.length - 1, prev + 1));
        }
        return;
      }
      if (key.return) {
        if (selectedRow < agents.length) {
          const agent = agents[selectedRow];
          const field = FIELDS[selectedCol].key;
          const options = getSelectOptions(field, agent);

          if (options) {
            // Selection list mode for role/cli/model
            const currentVal = String(agent[field] ?? "");
            const idx = options.indexOf(currentVal);
            setSelectOptions(options);
            setSelectIndex(idx >= 0 ? idx : 0);
            setMode("select-option");
          } else {
            // Free-text edit mode for name
            const val = agent[field] ?? "";
            setEditValue(String(val));
            setEditCursor(String(val).length);
            setMode("edit-field");
          }
        } else if (selectedRow === agents.length) {
          // Add Agent
          const newIndex = agents.length + 1;
          const newAgent: AgentConfig = {
            name: `Agent ${newIndex}`,
            role: "worker",
            cli: "claude",
            model: "sonnet",
            window: "",
          };
          setAgents((prev) => [...prev, newAgent]);
        } else {
          // Save & Back
          const updatedConfig: AihiveConfig = {
            ...config,
            agents: resolveWindowLayout(agents),
          };
          onSave(updatedConfig);
        }
        return;
      }
      // Delete agent with 'd'
      if (input === "d" && selectedRow < agents.length && agents.length > 1) {
        setAgents((prev) => prev.filter((_, i) => i !== selectedRow));
        if (selectedRow >= agents.length - 1) {
          setSelectedRow(Math.max(0, agents.length - 2));
        }
        return;
      }
    },
    { isActive: mode === "list" },
  );

  // Field edit mode input
  useInput(
    (input, key) => {
      if (key.escape) {
        setMode("list");
        return;
      }
      if (key.return) {
        // Apply edit
        const field = FIELDS[selectedCol].key;
        setAgents((prev) =>
          prev.map((a, i) =>
            i === selectedRow ? { ...a, [field]: editValue } : a,
          ),
        );
        setMode("list");
        return;
      }
      if (key.backspace || key.delete) {
        if (editCursor > 0) {
          setEditValue(
            (prev) =>
              prev.slice(0, editCursor - 1) + prev.slice(editCursor),
          );
          setEditCursor((prev) => prev - 1);
        }
        return;
      }
      if (key.leftArrow) {
        setEditCursor((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.rightArrow) {
        setEditCursor((prev) => Math.min(editValue.length, prev + 1));
        return;
      }
      if (key.ctrl && input === "a") {
        setEditCursor(0);
        return;
      }
      if (key.ctrl && input === "e") {
        setEditCursor(editValue.length);
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setEditValue(
          (prev) =>
            prev.slice(0, editCursor) + input + prev.slice(editCursor),
        );
        setEditCursor((prev) => prev + input.length);
      }
    },
    { isActive: mode === "edit-field" },
  );

  // Selection list input (for role/cli/model)
  useInput(
    (input, key) => {
      if (key.escape) {
        setMode("list");
        return;
      }
      if (key.upArrow || input === "k") {
        setSelectIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow || input === "j") {
        setSelectIndex((prev) =>
          Math.min(selectOptions.length - 1, prev + 1),
        );
        return;
      }
      if (key.return) {
        const field = FIELDS[selectedCol].key;
        const selected = selectOptions[selectIndex];
        setAgents((prev) =>
          prev.map((a, i) => {
            if (i !== selectedRow) return a;
            const updated = { ...a, [field]: selected };
            // When CLI changes, reset model to first available option
            if (field === "cli") {
              const models = getCliModels(selected);
              if (!models.includes(updated.model ?? "")) {
                updated.model = models[0];
              }
            }
            return updated;
          }),
        );
        setMode("list");
        return;
      }
    },
    { isActive: mode === "select-option" },
  );

  const colWidths: Record<EditField, number> = { name: 18, role: 14, cli: 10, model: 16 };

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="cyan">
          Agent Configuration
        </Text>
        <Text dimColor>
          ↑↓←→ navigate | Enter edit | d delete | Esc back
        </Text>

        {/* Header */}
        <Box marginTop={1} gap={1}>
          <Text dimColor>{"  "}</Text>
          <Text bold color="gray">
            {"#".padEnd(3)}
          </Text>
          {FIELDS.map((f) => (
            <Text key={f.key} bold color="gray">
              {f.label.padEnd(colWidths[f.key])}
            </Text>
          ))}
        </Box>

        {/* Agent rows */}
        {agents.map((agent, rowIdx) => {
          const isRowSelected = selectedRow === rowIdx;
          return (
            <Box key={rowIdx} gap={1}>
              <Text color="cyan">{isRowSelected ? "▶" : " "}</Text>
              <Text dimColor>{String(rowIdx + 1).padEnd(3)}</Text>
              {FIELDS.map((f, colIdx) => {
                const isCellSelected =
                  isRowSelected && selectedCol === colIdx;
                const isEditing =
                  isCellSelected && mode === "edit-field";
                const isSelecting =
                  isCellSelected && mode === "select-option";
                const val = String(agent[f.key] ?? "");

                if (isEditing) {
                  const before = editValue.slice(0, editCursor);
                  const cursorChar = editValue[editCursor] ?? " ";
                  const after = editValue.slice(editCursor + 1);
                  return (
                    <Box key={f.key}>
                      <Text color="cyan">{before}</Text>
                      <Text backgroundColor="cyan" color="black">
                        {cursorChar}
                      </Text>
                      <Text color="cyan">
                        {after.padEnd(
                          Math.max(0, colWidths[f.key] - editValue.length),
                        )}
                      </Text>
                    </Box>
                  );
                }

                if (isSelecting) {
                  return (
                    <Box key={f.key} flexDirection="column">
                      {selectOptions.map((opt, optIdx) => (
                        <Text
                          key={opt}
                          bold={optIdx === selectIndex}
                          color={optIdx === selectIndex ? "cyan" : "gray"}
                          backgroundColor={
                            optIdx === selectIndex ? "gray" : undefined
                          }
                        >
                          {(optIdx === selectIndex ? "▸ " : "  ") +
                            opt.padEnd(colWidths[f.key] - 2)}
                        </Text>
                      ))}
                    </Box>
                  );
                }

                return (
                  <Text
                    key={f.key}
                    bold={isCellSelected}
                    color={isCellSelected ? "cyan" : undefined}
                    backgroundColor={
                      isCellSelected ? "gray" : undefined
                    }
                  >
                    {val.padEnd(colWidths[f.key])}
                  </Text>
                );
              })}
            </Box>
          );
        })}

        {/* Add Agent row */}
        <Box marginTop={1} gap={1}>
          <Text color="cyan">
            {selectedRow === agents.length ? "▶" : " "}
          </Text>
          <Text
            bold={selectedRow === agents.length}
            color={selectedRow === agents.length ? "green" : "gray"}
          >
            + Add Agent
          </Text>
        </Box>

        {/* Save & Back row */}
        <Box gap={1}>
          <Text color="cyan">
            {selectedRow === agents.length + 1 ? "▶" : " "}
          </Text>
          <Text
            bold={selectedRow === agents.length + 1}
            color={selectedRow === agents.length + 1 ? "yellow" : "gray"}
          >
            Save & Back
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
