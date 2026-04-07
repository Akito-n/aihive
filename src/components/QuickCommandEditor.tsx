import { Box, Text, useInput, useStdout } from "ink";
import { useState } from "react";
import type { QuickCommand } from "../lib/quick-commands.js";
import {
  deleteQuickCommand,
  loadQuickCommands,
  saveQuickCommand,
} from "../lib/quick-commands.js";

interface QuickCommandEditorProps {
  onBack: () => void;
}

type EditMode = "list" | "edit-field" | "select-category" | "edit-prompt";
type EditField = "name" | "category" | "description" | "prompt";

const FIELDS: { key: EditField; label: string; width: number }[] = [
  { key: "name", label: "Name", width: 18 },
  { key: "category", label: "Category", width: 14 },
  { key: "description", label: "Description", width: 24 },
  { key: "prompt", label: "Prompt", width: 30 },
];

// ── Prompt Editor (full-screen textarea) ──

interface PromptEditorProps {
  commandName: string;
  initialValue: string;
  onSave: (value: string) => void;
  onCancel: () => void;
}

function PromptEditor({
  commandName,
  initialValue,
  onSave,
  onCancel,
}: PromptEditorProps) {
  const { stdout } = useStdout();
  const [lines, setLines] = useState<string[]>(() => {
    const parts = initialValue.split("\n");
    return parts.length > 0 ? parts : [""];
  });
  const [cursorRow, setCursorRow] = useState(0);
  const [cursorCol, setCursorCol] = useState(0);
  const [scrollOffset, setScrollOffset] = useState(0);

  // Reserve lines for header (title, help text, top border, margin) + footer (bottom border)
  const termRows = stdout?.rows ?? 24;
  const termWidth = (stdout?.columns ?? 80) - 8;
  const visibleLines = Math.max(3, termRows - 10);

  // Keep cursor in view (synchronous, no useEffect needed)
  let adjustedScroll = scrollOffset;
  if (cursorRow < adjustedScroll) {
    adjustedScroll = cursorRow;
  } else if (cursorRow >= adjustedScroll + visibleLines) {
    adjustedScroll = cursorRow - visibleLines + 1;
  }
  if (adjustedScroll !== scrollOffset) {
    // Will be applied on next render cycle
    setScrollOffset(adjustedScroll);
  }

  useInput((input, key) => {
    // Ctrl+S to save
    if (key.ctrl && input === "s") {
      onSave(lines.join("\n"));
      return;
    }
    if (key.escape) {
      onCancel();
      return;
    }

    if (key.upArrow) {
      if (cursorRow > 0) {
        setCursorRow(cursorRow - 1);
        setCursorCol(Math.min(cursorCol, lines[cursorRow - 1].length));
      }
      return;
    }
    if (key.downArrow) {
      if (cursorRow < lines.length - 1) {
        setCursorRow(cursorRow + 1);
        setCursorCol(Math.min(cursorCol, lines[cursorRow + 1].length));
      }
      return;
    }
    if (key.leftArrow) {
      if (cursorCol > 0) {
        setCursorCol(cursorCol - 1);
      } else if (cursorRow > 0) {
        setCursorRow(cursorRow - 1);
        setCursorCol(lines[cursorRow - 1].length);
      }
      return;
    }
    if (key.rightArrow) {
      if (cursorCol < lines[cursorRow].length) {
        setCursorCol(cursorCol + 1);
      } else if (cursorRow < lines.length - 1) {
        setCursorRow(cursorRow + 1);
        setCursorCol(0);
      }
      return;
    }

    if (key.ctrl && input === "a") {
      setCursorCol(0);
      return;
    }
    if (key.ctrl && input === "e") {
      setCursorCol(lines[cursorRow].length);
      return;
    }

    if (key.return) {
      // Split line at cursor
      const line = lines[cursorRow];
      const before = line.slice(0, cursorCol);
      const after = line.slice(cursorCol);
      const newLines = [...lines];
      newLines.splice(cursorRow, 1, before, after);
      setLines(newLines);
      setCursorRow(cursorRow + 1);
      setCursorCol(0);
      return;
    }

    if (key.backspace || key.delete) {
      if (cursorCol > 0) {
        const line = lines[cursorRow];
        const newLine = line.slice(0, cursorCol - 1) + line.slice(cursorCol);
        const newLines = [...lines];
        newLines[cursorRow] = newLine;
        setLines(newLines);
        setCursorCol(cursorCol - 1);
      } else if (cursorRow > 0) {
        // Merge with previous line
        const prevLine = lines[cursorRow - 1];
        const currentLine = lines[cursorRow];
        const newLines = [...lines];
        newLines.splice(cursorRow - 1, 2, prevLine + currentLine);
        setLines(newLines);
        setCursorRow(cursorRow - 1);
        setCursorCol(prevLine.length);
      }
      return;
    }

    if (key.ctrl && input === "k") {
      // Delete from cursor to end of line
      const line = lines[cursorRow];
      const newLines = [...lines];
      newLines[cursorRow] = line.slice(0, cursorCol);
      setLines(newLines);
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      const sanitized = input.replace(/[\r]/g, "");
      const line = lines[cursorRow];
      const newLine =
        line.slice(0, cursorCol) + sanitized + line.slice(cursorCol);
      const newLines = [...lines];
      newLines[cursorRow] = newLine;
      setLines(newLines);
      setCursorCol(cursorCol + sanitized.length);
    }
  });

  const displayLines = lines.slice(
    adjustedScroll,
    adjustedScroll + visibleLines,
  );

  return (
    <Box flexDirection="column" paddingX={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
      >
        <Box justifyContent="space-between">
          <Text bold color="cyan">
            Editing Prompt: {commandName}
          </Text>
          <Text dimColor>
            Line {cursorRow + 1}/{lines.length} Col {cursorCol + 1}
          </Text>
        </Box>
        <Text dimColor>
          Ctrl+S save | Esc cancel | Enter new line | Ctrl+K delete line
        </Text>

        <Box
          marginTop={1}
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          width={termWidth}
        >
          {displayLines.map((line, vi) => {
            const actualRow = adjustedScroll + vi;
            const isCursorLine = actualRow === cursorRow;
            const lineNum = String(actualRow + 1).padStart(3, " ");
            const displayLine = line.slice(0, termWidth - 8);

            if (isCursorLine) {
              const before = displayLine.slice(0, cursorCol);
              const cursorChar = displayLine[cursorCol] ?? " ";
              const after = displayLine.slice(cursorCol + 1);

              return (
                <Box key={`line-${actualRow}`}>
                  <Text color="gray">{lineNum} </Text>
                  <Text>{before}</Text>
                  <Text backgroundColor="cyan" color="black">
                    {cursorChar}
                  </Text>
                  <Text>{after}</Text>
                </Box>
              );
            }

            return (
              <Box key={`line-${actualRow}`}>
                <Text color="gray">{lineNum} </Text>
                <Text dimColor>{displayLine}</Text>
              </Box>
            );
          })}
        </Box>

        {adjustedScroll > 0 && (
          <Text dimColor>↑ {adjustedScroll} more lines above</Text>
        )}
        {adjustedScroll + visibleLines < lines.length && (
          <Text dimColor>
            ↓ {lines.length - adjustedScroll - visibleLines} more lines below
          </Text>
        )}
      </Box>
    </Box>
  );
}

// ── Main Editor ──

export function QuickCommandEditor({ onBack }: QuickCommandEditorProps) {
  const [commands, setCommands] = useState<QuickCommand[]>(() =>
    loadQuickCommands(process.cwd()),
  );
  const [selectedRow, setSelectedRow] = useState(0);
  const [selectedCol, setSelectedCol] = useState(0);
  const [mode, setMode] = useState<EditMode>("list");
  const [editValue, setEditValue] = useState("");
  const [editCursor, setEditCursor] = useState(0);
  const [selectIndex, setSelectIndex] = useState(0);

  const totalRows = commands.length + 2; // commands + [Add] + [Save & Back]

  // Collect existing categories for selection
  const existingCategories = [...new Set(commands.map((c) => c.category))];
  if (!existingCategories.includes("general"))
    existingCategories.unshift("general");

  useInput(
    (input, key) => {
      if (key.escape) {
        onBack();
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
        if (selectedRow < commands.length) {
          setSelectedCol((prev) => Math.max(0, prev - 1));
        }
        return;
      }
      if (key.rightArrow) {
        if (selectedRow < commands.length) {
          setSelectedCol((prev) => Math.min(FIELDS.length - 1, prev + 1));
        }
        return;
      }
      if (key.return) {
        if (selectedRow < commands.length) {
          const field = FIELDS[selectedCol].key;
          if (field === "category") {
            const currentVal = commands[selectedRow].category;
            const idx = existingCategories.indexOf(currentVal);
            setSelectIndex(idx >= 0 ? idx : 0);
            setMode("select-category");
          } else if (field === "prompt") {
            setMode("edit-prompt");
          } else {
            const val = commands[selectedRow][field];
            setEditValue(val);
            setEditCursor(val.length);
            setMode("edit-field");
          }
        } else if (selectedRow === commands.length) {
          // Add new command
          const newCmd: QuickCommand = {
            name: "New Command",
            category: "general",
            description: "",
            prompt: "Enter your prompt here",
          };
          setCommands((prev) => [...prev, newCmd]);
        } else {
          // Save & Back
          for (const cmd of commands) {
            saveQuickCommand(process.cwd(), cmd);
          }
          onBack();
        }
        return;
      }
      if (
        input === "d" &&
        selectedRow < commands.length &&
        commands.length > 0
      ) {
        const cmd = commands[selectedRow];
        deleteQuickCommand(process.cwd(), cmd.name);
        setCommands((prev) => prev.filter((_, i) => i !== selectedRow));
        if (selectedRow >= commands.length - 1) {
          setSelectedRow(Math.max(0, commands.length - 2));
        }
        return;
      }
    },
    { isActive: mode === "list" },
  );

  // Free-text edit (name, description)
  useInput(
    (input, key) => {
      if (key.escape) {
        setMode("list");
        return;
      }
      if (key.return) {
        const field = FIELDS[selectedCol].key;
        setCommands((prev) =>
          prev.map((c, i) =>
            i === selectedRow ? { ...c, [field]: editValue } : c,
          ),
        );
        setMode("list");
        return;
      }
      if (key.backspace || key.delete) {
        if (editCursor > 0) {
          setEditValue(
            (prev) => prev.slice(0, editCursor - 1) + prev.slice(editCursor),
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
          (prev) => prev.slice(0, editCursor) + input + prev.slice(editCursor),
        );
        setEditCursor((prev) => prev + input.length);
      }
    },
    { isActive: mode === "edit-field" },
  );

  // Category selection
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
          Math.min(existingCategories.length - 1, prev + 1),
        );
        return;
      }
      if (key.return) {
        const selected = existingCategories[selectIndex];
        setCommands((prev) =>
          prev.map((c, i) =>
            i === selectedRow ? { ...c, category: selected } : c,
          ),
        );
        setMode("list");
        return;
      }
    },
    { isActive: mode === "select-category" },
  );

  // Full-screen prompt editor
  if (mode === "edit-prompt" && selectedRow < commands.length) {
    const cmd = commands[selectedRow];
    return (
      <PromptEditor
        commandName={cmd.name}
        initialValue={cmd.prompt}
        onSave={(value) => {
          setCommands((prev) =>
            prev.map((c, i) =>
              i === selectedRow ? { ...c, prompt: value } : c,
            ),
          );
          setMode("list");
        }}
        onCancel={() => setMode("list")}
      />
    );
  }

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="yellow"
        paddingX={2}
        paddingY={1}
      >
        <Text bold color="yellow">
          Quick Commands
        </Text>
        <Text dimColor>
          {"↑↓←→ navigate | Enter edit | d delete | Esc back"}
        </Text>

        {/* Header */}
        <Box marginTop={1} gap={1}>
          <Text dimColor>{"  "}</Text>
          <Text bold color="gray">
            {"#".padEnd(3)}
          </Text>
          {FIELDS.map((f) => (
            <Text key={f.key} bold color="gray">
              {f.label.padEnd(f.width)}
            </Text>
          ))}
        </Box>

        {/* Command rows */}
        {commands.map((cmd, rowIdx) => {
          const isRowSelected = selectedRow === rowIdx;
          return (
            <Box key={`row-${rowIdx}-${cmd.name}`} gap={1}>
              <Text color="yellow">{isRowSelected ? "▶" : " "}</Text>
              <Text dimColor>{String(rowIdx + 1).padEnd(3)}</Text>
              {FIELDS.map((f, colIdx) => {
                const isCellSelected = isRowSelected && selectedCol === colIdx;
                const isEditing = isCellSelected && mode === "edit-field";
                const isSelecting =
                  isCellSelected && mode === "select-category";
                const val = cmd[f.key];
                const displayVal =
                  val.length > f.width ? `${val.slice(0, f.width - 1)}…` : val;

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
                        {after.padEnd(Math.max(0, f.width - editValue.length))}
                      </Text>
                    </Box>
                  );
                }

                if (isSelecting) {
                  return (
                    <Box key={f.key} flexDirection="column">
                      {existingCategories.map((cat, catIdx) => (
                        <Text
                          key={cat}
                          bold={catIdx === selectIndex}
                          color={catIdx === selectIndex ? "yellow" : "gray"}
                          backgroundColor={
                            catIdx === selectIndex ? "gray" : undefined
                          }
                        >
                          {(catIdx === selectIndex ? "▸ " : "  ") +
                            cat.padEnd(f.width - 2)}
                        </Text>
                      ))}
                    </Box>
                  );
                }

                return (
                  <Text
                    key={f.key}
                    bold={isCellSelected}
                    color={isCellSelected ? "yellow" : undefined}
                    backgroundColor={isCellSelected ? "gray" : undefined}
                  >
                    {displayVal.padEnd(f.width)}
                  </Text>
                );
              })}
            </Box>
          );
        })}

        {/* Add Command row */}
        <Box marginTop={1} gap={1}>
          <Text color="yellow">
            {selectedRow === commands.length ? "▶" : " "}
          </Text>
          <Text
            bold={selectedRow === commands.length}
            color={selectedRow === commands.length ? "green" : "gray"}
          >
            + Add Command
          </Text>
        </Box>

        {/* Save & Back row */}
        <Box gap={1}>
          <Text color="yellow">
            {selectedRow === commands.length + 1 ? "▶" : " "}
          </Text>
          <Text
            bold={selectedRow === commands.length + 1}
            color={selectedRow === commands.length + 1 ? "yellow" : "gray"}
          >
            Save & Back
          </Text>
        </Box>
      </Box>
    </Box>
  );
}
