import { Box, Text, useInput, useStdout } from "ink";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SlashCommand } from "../lib/commands.js";
import type { PromptInfo } from "./PaneView.js";

interface CommandInputProps {
  targetLabel: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  onQuickKey: (key: string) => void;
  onDoubleSlash?: () => void;
  promptInfo: PromptInfo;
  slashCommands: SlashCommand[];
}

const PLACEHOLDER = "Send a message...";

// Get display width of a string (CJK chars = 2, others = 1)
function displayWidth(str: string): number {
  let w = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0;
    if (
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fa1f)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

// Slice string by display width
function sliceByWidth(str: string, maxWidth: number): string {
  let w = 0;
  let i = 0;
  for (const ch of str) {
    const code = ch.codePointAt(0) ?? 0;
    const cw =
      (code >= 0x3000 && code <= 0x9fff) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0xffe0 && code <= 0xffe6) ||
      (code >= 0x20000 && code <= 0x2fa1f)
        ? 2
        : 1;
    if (w + cw > maxWidth) break;
    w += cw;
    i += ch.length;
  }
  return str.slice(0, i);
}

const QUICK_KEYS = [
  { label: "1", value: "1", color: "green" },
  { label: "2", value: "2", color: "yellow" },
  { label: "3", value: "3", color: "red" },
  { label: "y", value: "y", color: "green" },
  { label: "n", value: "n", color: "red" },
];

const MAX_VISIBLE_COMMANDS = 8;

const BURST_THRESHOLD = 5;
const BURST_WINDOW_MS = 50;

// Paste range in the real value string
interface PasteRange {
  start: number;
  end: number; // exclusive
}

function pasteAlias(charCount: number): string {
  return `[${charCount} chars pasted]`;
}

// Build the display string from real value + paste range
function buildDisplay(value: string, paste: PasteRange | null): string {
  if (!paste) return value;
  const before = value.slice(0, paste.start);
  const alias = pasteAlias(paste.end - paste.start);
  const after = value.slice(paste.end);
  return before + alias + after;
}

// Convert display cursor position to real value cursor position
function displayToReal(
  dCursor: number,
  _value: string,
  paste: PasteRange | null,
): number {
  if (!paste) return dCursor;
  const aliasText = pasteAlias(paste.end - paste.start);
  const aliasStart = paste.start; // display position where alias starts
  const aliasEnd = paste.start + aliasText.length; // display position where alias ends

  if (dCursor <= aliasStart) {
    // Before the alias — maps 1:1
    return dCursor;
  }
  if (dCursor < aliasEnd) {
    // Inside the alias — map to paste.start (beginning of block)
    return paste.start;
  }
  // After the alias — offset from paste.end
  return paste.end + (dCursor - aliasEnd);
}

// Convert real cursor to display cursor
function realToDisplay(
  rCursor: number,
  _value: string,
  paste: PasteRange | null,
): number {
  if (!paste) return rCursor;
  const aliasText = pasteAlias(paste.end - paste.start);

  if (rCursor <= paste.start) return rCursor;
  if (rCursor <= paste.end) return paste.start + aliasText.length;
  return paste.start + aliasText.length + (rCursor - paste.end);
}

export function CommandInput({
  targetLabel,
  onSubmit,
  onCancel,
  onQuickKey,
  onDoubleSlash,
  promptInfo,
  slashCommands,
}: CommandInputProps) {
  const [value, setValue] = useState("");
  const [cursor, setCursor] = useState(0); // real cursor in value
  const [cursorVisible, setCursorVisible] = useState(true);
  const [scrollOffset, setScrollOffset] = useState(0);
  const [selectedCmd, setSelectedCmd] = useState(0);
  const [lastQuery, setLastQuery] = useState("");
  const [paste, setPaste] = useState<PasteRange | null>(null);
  const burstRef = useRef({
    count: 0,
    timer: null as ReturnType<typeof setTimeout> | null,
  });
  const { stdout } = useStdout();

  const viewWidth = Math.max(20, (stdout?.columns ?? 80) - 6);

  const displayValue = buildDisplay(value, paste);
  const displayCursor = realToDisplay(cursor, value, paste);
  const aliasText = paste ? pasteAlias(paste.end - paste.start) : "";
  const aliasDisplayStart = paste ? paste.start : 0;
  const aliasDisplayEnd = paste ? paste.start + aliasText.length : 0;

  // Double slash detection: open quick command menu
  useEffect(() => {
    if (value === "//" && onDoubleSlash) {
      setValue("");
      setCursor(0);
      setScrollOffset(0);
      onDoubleSlash();
    }
  }, [value, onDoubleSlash]);

  // Slash command filtering
  const showSlashMenu =
    value.startsWith("/") &&
    !value.startsWith("//") &&
    !value.includes(" ") &&
    !paste;
  const query = showSlashMenu ? value.slice(1).toLowerCase() : "";

  const filteredCommands = useMemo(() => {
    if (!showSlashMenu) return [];
    if (query === "") return slashCommands;
    return slashCommands.filter((cmd) =>
      cmd.name.toLowerCase().includes(query),
    );
  }, [showSlashMenu, query, slashCommands]);

  if (query !== lastQuery) {
    setSelectedCmd(0);
    setLastQuery(query);
  }

  useEffect(() => {
    const interval = setInterval(() => setCursorVisible((v) => !v), 530);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setCursorVisible(true);
  }, []);

  useEffect(() => {
    const beforeCursor = displayValue.slice(0, displayCursor);
    const cursorPos = displayWidth(beforeCursor);
    if (cursorPos < scrollOffset) {
      setScrollOffset(cursorPos);
    } else if (cursorPos >= scrollOffset + viewWidth - 1) {
      setScrollOffset(cursorPos - viewWidth + 2);
    }
  }, [displayCursor, displayValue, viewWidth, scrollOffset]);

  // Check if display cursor is inside the alias block
  function isInAlias(dCursor: number): boolean {
    if (!paste) return false;
    return dCursor > aliasDisplayStart && dCursor <= aliasDisplayEnd;
  }

  // Remove paste block, keep text before and after
  function removePasteBlock() {
    if (!paste) return;
    const before = value.slice(0, paste.start);
    const after = value.slice(paste.end);
    setValue(before + after);
    setCursor(paste.start);
    setScrollOffset(0);
    setPaste(null);
  }

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    if (showSlashMenu && filteredCommands.length > 0) {
      if (key.upArrow) {
        setSelectedCmd((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setSelectedCmd((prev) =>
          Math.min(filteredCommands.length - 1, prev + 1),
        );
        return;
      }
      if (key.return || key.tab) {
        const cmd = filteredCommands[selectedCmd];
        if (cmd) {
          const cmdText = `/${cmd.name} `;
          setValue(cmdText);
          setCursor(cmdText.length);
          setScrollOffset(0);
        }
        return;
      }
    }

    if (key.return) {
      if (value.trim()) {
        onSubmit(value.trim());
        setValue("");
        setCursor(0);
        setScrollOffset(0);
        setPaste(null);
      }
      return;
    }

    if (key.leftArrow) {
      const newDC = Math.max(0, displayCursor - 1);
      // Skip over alias interior: if entering alias from right, jump to alias start
      if (paste && newDC > aliasDisplayStart && newDC < aliasDisplayEnd) {
        setCursor(paste.start);
      } else {
        setCursor(displayToReal(newDC, value, paste));
      }
      return;
    }
    if (key.rightArrow) {
      const newDC = Math.min(displayValue.length, displayCursor + 1);
      // Skip over alias interior: if entering alias from left, jump to alias end
      if (paste && newDC > aliasDisplayStart && newDC < aliasDisplayEnd) {
        setCursor(paste.end);
      } else {
        setCursor(displayToReal(newDC, value, paste));
      }
      return;
    }

    if (key.ctrl && input === "a") {
      setCursor(0);
      return;
    }
    if (key.ctrl && input === "e") {
      setCursor(value.length);
      return;
    }

    if (key.ctrl && input === "w") {
      // Delete word backward
      if (paste && cursor > paste.start && cursor <= paste.end) {
        // Cursor inside paste block — remove entire block
        removePasteBlock();
      } else if (paste && cursor === paste.end) {
        // Right at end of paste block — Ctrl+W removes block
        removePasteBlock();
      } else {
        const before = value.slice(0, cursor);
        const after = value.slice(cursor);
        const trimmed = before.replace(/\S+\s*$/, "");
        const deleted = before.length - trimmed.length;
        setValue(trimmed + after);
        setCursor(trimmed.length);
        // Adjust paste range if deletion was before paste
        if (paste && trimmed.length < paste.start) {
          if (paste.start - deleted < trimmed.length) {
            // Deletion crossed into paste territory — remove paste
            setPaste(null);
          } else {
            setPaste({
              start: paste.start - deleted,
              end: paste.end - deleted,
            });
          }
        }
      }
      return;
    }

    if (key.ctrl && input === "u") {
      // Delete everything before cursor
      const after = value.slice(cursor);
      setValue(after);
      setCursor(0);
      if (paste) {
        if (cursor >= paste.end) {
          // Deleted the whole paste block
          setPaste(null);
        } else if (cursor > paste.start) {
          // Deleted part of paste block — remove it
          setPaste(null);
        } else {
          // Paste block shifts left
          setPaste({ start: paste.start - cursor, end: paste.end - cursor });
        }
      }
      return;
    }

    if (key.backspace || key.delete) {
      if (cursor > 0) {
        if (paste && cursor > paste.start && cursor <= paste.end) {
          // Cursor is at end of or inside paste block — remove entire block
          removePasteBlock();
        } else if (
          paste &&
          cursor === paste.start &&
          displayCursor > 0 &&
          isInAlias(displayCursor)
        ) {
          // Display cursor is inside alias from left side
          removePasteBlock();
        } else {
          // Normal backspace
          const newValue = value.slice(0, cursor - 1) + value.slice(cursor);
          setValue(newValue);
          setCursor(cursor - 1);
          if (paste) {
            if (cursor - 1 < paste.start) {
              // Deleted before paste — shift range
              setPaste({ start: paste.start - 1, end: paste.end - 1 });
            }
          }
        }
      }
      return;
    }

    if (input && !key.ctrl && !key.meta) {
      if (
        value.length === 0 &&
        promptInfo.detected &&
        /^[1-9yn]$/.test(input)
      ) {
        onQuickKey(input);
        return;
      }

      const sanitized = input.replace(/[\r\n]+/g, " ");

      // Burst detection
      const burst = burstRef.current;
      burst.count += sanitized.length;
      if (burst.timer) clearTimeout(burst.timer);
      burst.timer = setTimeout(() => {
        if (burst.count >= BURST_THRESHOLD && !paste) {
          // Mark entire current value as pasted
          setValue((cur) => {
            setPaste({ start: 0, end: cur.length });
            setCursor(cur.length);
            setScrollOffset(0);
            return cur;
          });
        }
        burst.count = 0;
      }, BURST_WINDOW_MS);

      // Insert at cursor
      const newValue = value.slice(0, cursor) + sanitized + value.slice(cursor);
      setValue(newValue);
      setCursor(cursor + sanitized.length);

      // Adjust paste range if inserting before or at paste start
      if (paste) {
        if (cursor <= paste.start) {
          setPaste({
            start: paste.start + sanitized.length,
            end: paste.end + sanitized.length,
          });
        } else if (cursor >= paste.end) {
          // After paste — no change to range
        } else {
          // Inside paste block — shouldn't happen due to cursor skipping, but clear paste
          setPaste(null);
        }
      }
    }
  });

  const isEmpty = value.length === 0;

  // Compute visible portion of display text
  const renderText = () => {
    const dv = displayValue;
    const dc = displayCursor;
    const before = dv.slice(0, dc);
    const cursorChar = dv[dc] ?? " ";
    const after = dv.slice(dc + 1);

    const beforeWidth = displayWidth(before);

    let skipWidth = 0;
    let skipChars = 0;
    for (const ch of before) {
      const code = ch.codePointAt(0) ?? 0;
      const cw =
        (code >= 0x3000 && code <= 0x9fff) ||
        (code >= 0xf900 && code <= 0xfaff) ||
        (code >= 0xff01 && code <= 0xff60) ||
        (code >= 0xffe0 && code <= 0xffe6) ||
        (code >= 0x20000 && code <= 0x2fa1f)
          ? 2
          : 1;
      if (skipWidth + cw > scrollOffset) break;
      skipWidth += cw;
      skipChars += ch.length;
    }

    const visibleBefore = before.slice(skipChars);
    const visibleBeforeWidth = beforeWidth - skipWidth;
    const remainingWidth = viewWidth - visibleBeforeWidth - 1;
    const visibleAfter = sliceByWidth(cursorChar + after, remainingWidth);
    const visibleCursorChar = visibleAfter.length > 0 ? visibleAfter[0] : " ";
    const visibleAfterText = visibleAfter.slice(visibleCursorChar.length);

    return {
      visibleBefore,
      visibleCursorChar,
      visibleAfterText,
      visStartCharIndex: skipChars,
    };
  };

  const rendered = isEmpty ? null : renderText();
  const {
    visibleBefore,
    visibleCursorChar,
    visibleAfterText,
    visStartCharIndex,
  } = rendered ?? {
    visibleBefore: "",
    visibleCursorChar: "",
    visibleAfterText: "",
    visStartCharIndex: 0,
  };

  // Render with alias coloring
  const renderContent = () => {
    if (isEmpty) {
      return (
        <>
          {cursorVisible ? (
            <Text backgroundColor="cyan" color="black">
              {PLACEHOLDER[0]}
            </Text>
          ) : (
            <Text dimColor>{PLACEHOLDER[0]}</Text>
          )}
          <Text dimColor>{PLACEHOLDER.slice(1)}</Text>
        </>
      );
    }

    if (paste) {
      const renderSegment = (text: string, posInDisplay: number) => {
        if (text.length === 0) return null;
        const end = posInDisplay + text.length;
        if (end <= aliasDisplayStart || posInDisplay >= aliasDisplayEnd) {
          return <Text>{text}</Text>;
        }
        if (posInDisplay >= aliasDisplayStart && end <= aliasDisplayEnd) {
          return <Text color="yellow">{text}</Text>;
        }
        // Mixed
        const parts: React.ReactNode[] = [];
        let pos = posInDisplay;
        for (const ch of text) {
          const inAlias = pos >= aliasDisplayStart && pos < aliasDisplayEnd;
          // Batch consecutive chars of same type
          parts.push(
            <Text key={pos} color={inAlias ? "yellow" : undefined}>
              {ch}
            </Text>,
          );
          pos += ch.length;
        }
        return <>{parts}</>;
      };

      const vbPos = visStartCharIndex;
      const vcPos = vbPos + visibleBefore.length;
      const vaPos = vcPos + visibleCursorChar.length;

      return (
        <>
          {scrollOffset > 0 && <Text dimColor>{"…"}</Text>}
          {renderSegment(visibleBefore, vbPos)}
          {cursorVisible ? (
            <Text backgroundColor="cyan" color="black">
              {visibleCursorChar}
            </Text>
          ) : vcPos >= aliasDisplayStart && vcPos < aliasDisplayEnd ? (
            <Text color="yellow">{visibleCursorChar}</Text>
          ) : (
            <Text>{visibleCursorChar}</Text>
          )}
          {renderSegment(visibleAfterText, vaPos)}
        </>
      );
    }

    return (
      <>
        {scrollOffset > 0 && <Text dimColor>{"…"}</Text>}
        <Text>{visibleBefore}</Text>
        {cursorVisible ? (
          <Text backgroundColor="cyan" color="black">
            {visibleCursorChar}
          </Text>
        ) : (
          <Text>{visibleCursorChar}</Text>
        )}
        <Text>{visibleAfterText}</Text>
      </>
    );
  };

  const visibleStart = Math.max(
    0,
    Math.min(
      selectedCmd - Math.floor(MAX_VISIBLE_COMMANDS / 2),
      filteredCommands.length - MAX_VISIBLE_COMMANDS,
    ),
  );
  const visibleCommands = filteredCommands.slice(
    visibleStart,
    visibleStart + MAX_VISIBLE_COMMANDS,
  );

  return (
    <Box flexDirection="column" width="100%">
      {showSlashMenu && filteredCommands.length > 0 && (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor="gray"
          paddingX={1}
          marginBottom={0}
        >
          <Box marginBottom={0}>
            <Text bold color="cyan">
              Commands
            </Text>
            <Text dimColor> ({filteredCommands.length})</Text>
          </Box>
          {visibleStart > 0 && <Text dimColor> ...</Text>}
          {visibleCommands.map((cmd, i) => {
            const actualIndex = visibleStart + i;
            const isSelected = actualIndex === selectedCmd;
            return (
              <Box key={cmd.name} gap={2}>
                <Text color={isSelected ? "cyan" : undefined} bold={isSelected}>
                  {isSelected ? ">" : " "} /{cmd.name}
                </Text>
                <Text dimColor>{cmd.description}</Text>
              </Box>
            );
          })}
          {visibleStart + MAX_VISIBLE_COMMANDS < filteredCommands.length && (
            <Text dimColor> ...</Text>
          )}
          <Box marginTop={0}>
            <Text dimColor>↑↓ select Enter/Tab complete</Text>
          </Box>
        </Box>
      )}

      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="cyan"
        paddingX={2}
        paddingY={1}
        width="100%"
      >
        <Box height={3} alignItems="center" overflowX="hidden">
          {renderContent()}
        </Box>

        {promptInfo.detected && (
          <Box flexDirection="column" gap={0}>
            <Box gap={1}>
              <Text color="yellow" bold>
                ⚡ Action required:
              </Text>
              {promptInfo.options.length > 0
                ? promptInfo.options.map((opt) => (
                    <Text key={opt} color="cyan">
                      [{opt}]
                    </Text>
                  ))
                : QUICK_KEYS.map((qk) => (
                    <Text key={qk.label} color={qk.color} bold>
                      [{qk.label}]
                    </Text>
                  ))}
            </Box>
            <Text dimColor>Press a key to respond (input must be empty)</Text>
          </Box>
        )}

        <Box justifyContent="space-between" marginTop={0}>
          <Text color="cyan" bold>
            → {targetLabel}
          </Text>
          <Box gap={3}>
            <Text dimColor>Esc back</Text>
            <Text dimColor>Enter send</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
