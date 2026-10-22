import {
  Box,
  type DOMElement,
  type Key,
  measureElement,
  Text,
  useCursor,
  useInput,
  useWindowSize,
} from "ink";
import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { SlashCommand } from "../lib/commands.js";
import { t } from "../lib/i18n.js";
import { promptKeys } from "../lib/pane-keys.js";
import type { PromptInfo } from "./PaneView.js";

interface CommandInputProps {
  targetLabel: string;
  onSubmit: (text: string) => void;
  onCancel: () => void;
  /** Keys for a choice menu in the pane, sent as they are (no Enter) */
  onPromptKeys: (keys: string[]) => void;
  onDoubleSlash?: () => void;
  promptInfo: PromptInfo;
  slashCommands: SlashCommand[];
}

const PLACEHOLDER = "Send a message...";

/** Where an element sits in Ink's output, from its last layout */
export function outputPosition(
  element: DOMElement | null,
): { x: number; y: number } | undefined {
  if (!element?.yogaNode) return undefined;
  let x = 0;
  let y = 0;
  for (
    let node: DOMElement | undefined = element;
    node?.yogaNode;
    node = node.parentNode
  ) {
    x += node.yogaNode.getComputedLeft();
    y += node.yogaNode.getComputedTop();
  }
  return { x, y };
}

// Display width of one character (CJK chars = 2, others = 1)
function charWidth(ch: string): number {
  const code = ch.codePointAt(0) ?? 0;
  return (code >= 0x3000 && code <= 0x9fff) ||
    (code >= 0xf900 && code <= 0xfaff) ||
    (code >= 0xff01 && code <= 0xff60) ||
    (code >= 0xffe0 && code <= 0xffe6) ||
    (code >= 0x20000 && code <= 0x2fa1f)
    ? 2
    : 1;
}

// Get display width of a string
export function displayWidth(str: string): number {
  let w = 0;
  for (const ch of str) w += charWidth(ch);
  return w;
}

// Slice string by display width
export function sliceByWidth(str: string, maxWidth: number): string {
  let w = 0;
  let i = 0;
  for (const ch of str) {
    const cw = charWidth(ch);
    if (w + cw > maxWidth) break;
    w += cw;
    i += ch.length;
  }
  return str.slice(0, i);
}

export interface LineView {
  /** Columns scrolled off the left edge */
  scrollOffset: number;
  /** Chars of the text hidden on the left */
  skipChars: number;
  before: string;
  cursorChar: string;
  after: string;
}

/**
 * Pick the part of a one-line input to show in `width` columns, keeping the
 * cursor in view. The result (with a leading "…" when scrolled) never takes
 * more than `width` columns, so the terminal never wraps the line.
 */
export function layoutLine(
  text: string,
  cursor: number,
  prevOffset: number,
  width: number,
): LineView {
  const before = text.slice(0, cursor);
  const code = text.codePointAt(cursor);
  const cursorChar = code === undefined ? " " : String.fromCodePoint(code);
  const cursorPos = displayWidth(before);
  const cursorWidth = charWidth(cursorChar);

  let scrollOffset = Math.min(Math.max(0, prevOffset), cursorPos);
  let skipWidth = 0;
  let skipChars = 0;
  for (;;) {
    skipWidth = 0;
    skipChars = 0;
    for (const ch of before) {
      const cw = charWidth(ch);
      if (skipWidth + cw > scrollOffset) break;
      skipWidth += cw;
      skipChars += ch.length;
    }
    const used =
      (scrollOffset > 0 ? 1 : 0) + cursorPos - skipWidth + cursorWidth;
    if (used <= width || skipChars >= before.length) break;
    scrollOffset += used - width;
  }

  const visibleBefore = before.slice(skipChars);
  const room =
    width - (scrollOffset > 0 ? 1 : 0) - (cursorPos - skipWidth) - cursorWidth;
  return {
    scrollOffset,
    skipChars,
    before: visibleBefore,
    cursorChar,
    after: sliceByWidth(text.slice(cursor + cursorChar.length), room),
  };
}

/** A line of the input text and where it starts in the text */
export interface InputLine {
  text: string;
  start: number;
}

export function splitLines(text: string): InputLine[] {
  const lines: InputLine[] = [];
  let start = 0;
  for (const line of text.split("\n")) {
    lines.push({ text: line, start });
    start += line.length + 1;
  }
  return lines;
}

/** Index of the line the cursor is on */
export function lineIndexAt(lines: InputLine[], cursor: number): number {
  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].start <= cursor) index = i;
  }
  return index;
}

/**
 * Cursor position one line up (-1) or down (1), at the same column as far
 * as the line allows. Undefined when there is no line that way.
 */
export function moveVertically(
  text: string,
  cursor: number,
  direction: -1 | 1,
): number | undefined {
  const lines = splitLines(text);
  const index = lineIndexAt(lines, cursor);
  const target = lines[index + direction];
  if (!target) return undefined;
  const column = displayWidth(
    text.slice(lines[index].start, Math.max(lines[index].start, cursor)),
  );
  return target.start + sliceByWidth(target.text, column).length;
}

/**
 * Ctrl+Enter, Shift+Enter and Option+Enter add a line instead of sending.
 * Ctrl+Enter and Shift+Enter only reach us from terminals that speak the
 * kitty keyboard protocol; elsewhere Option+Enter and Ctrl+J (a bare
 * linefeed) do the same.
 */
export function isNewlineKey(input: string, key: Key): boolean {
  if (key.return) return key.ctrl || key.shift || key.meta;
  return input === "\n";
}

const QUICK_KEYS = [
  { label: "1", value: "1", color: "green" },
  { label: "2", value: "2", color: "yellow" },
  { label: "3", value: "3", color: "red" },
  { label: "y", value: "y", color: "green" },
  { label: "n", value: "n", color: "red" },
];

const MAX_VISIBLE_COMMANDS = 8;
const MAX_VISIBLE_LINES = 5;

const BURST_THRESHOLD = 60;
const BURST_WINDOW_MS = 50;

// Paste range in the real value string
export interface PasteRange {
  start: number;
  end: number; // exclusive
}

export function pasteAlias(charCount: number): string {
  return `[${charCount} chars pasted]`;
}

// Build the display string from real value + paste range
export function buildDisplay(value: string, paste: PasteRange | null): string {
  if (!paste) return value;
  const before = value.slice(0, paste.start);
  const alias = pasteAlias(paste.end - paste.start);
  const after = value.slice(paste.end);
  return before + alias + after;
}

// Convert display cursor position to real value cursor position
export function displayToReal(
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
export function realToDisplay(
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
  onPromptKeys,
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
  const { columns } = useWindowSize();
  const lineRef = useRef<DOMElement>(null);
  const { setCursorPosition } = useCursor();

  const boxRef = useRef<DOMElement>(null);
  const [measuredWidth, setMeasuredWidth] = useState(0);

  // Use the width the line actually got from the layout: the input sits
  // inside the screen's own padding, so the terminal width overestimates it
  useEffect(() => {
    if (!boxRef.current) return;
    const { width } = measureElement(boxRef.current);
    if (width > 0 && width !== measuredWidth) setMeasuredWidth(width);
  });

  const viewWidth = Math.max(3, measuredWidth || columns - 8);

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
    !value.includes("\n") &&
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

  const isEmpty = value.length === 0;
  const lines = splitLines(displayValue);
  const cursorLine = lineIndexAt(lines, displayCursor);
  const firstVisibleLine = Math.max(0, cursorLine - MAX_VISIBLE_LINES + 1);
  const visibleLines = lines.slice(
    firstVisibleLine,
    firstVisibleLine + MAX_VISIBLE_LINES,
  );
  const view = isEmpty
    ? null
    : layoutLine(
        lines[cursorLine].text,
        displayCursor - lines[cursorLine].start,
        scrollOffset,
        viewWidth,
      );

  const nextOffset = view?.scrollOffset ?? 0;
  useEffect(() => {
    if (nextOffset !== scrollOffset) setScrollOffset(nextOffset);
  }, [nextOffset, scrollOffset]);

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

  function insertAtCursor(text: string) {
    setValue(value.slice(0, cursor) + text + value.slice(cursor));
    setCursor(cursor + text.length);
    if (paste && cursor <= paste.start) {
      setPaste({
        start: paste.start + text.length,
        end: paste.end + text.length,
      });
    }
  }

  useInput((input, key) => {
    if (key.escape) {
      onCancel();
      return;
    }

    // With the input empty, keys answer the pane's choice menu
    if (value.length === 0 && promptInfo.detected) {
      const keys = promptKeys(input, key);
      if (keys) {
        onPromptKeys(keys);
        return;
      }
    }

    if (isNewlineKey(input, key)) {
      insertAtCursor("\n");
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

    if (key.upArrow || key.downArrow) {
      const moved = moveVertically(
        displayValue,
        displayCursor,
        key.upArrow ? -1 : 1,
      );
      if (moved !== undefined) setCursor(displayToReal(moved, value, paste));
      return;
    }

    if (key.ctrl && input === "a") {
      setCursor(value.lastIndexOf("\n", cursor - 1) + 1);
      return;
    }
    if (key.ctrl && input === "e") {
      const lineEnd = value.indexOf("\n", cursor);
      setCursor(lineEnd === -1 ? value.length : lineEnd);
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
      const sanitized = input.replace(/[\r\n]+/g, " ");

      // Insert at cursor
      const newValue = value.slice(0, cursor) + sanitized + value.slice(cursor);

      // Immediate paste detection: single input chunk >= threshold
      if (sanitized.length >= BURST_THRESHOLD && !paste) {
        const pasteStart = cursor;
        const pasteEnd = cursor + sanitized.length;
        setValue(newValue);
        setCursor(pasteEnd);
        setPaste({ start: pasteStart, end: pasteEnd });
        setScrollOffset(0);
        burstRef.current.count = 0;
        return;
      }

      // Burst detection for slower paste (multiple rapid small inputs)
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

  const shownOffset = view?.scrollOffset ?? 0;
  const visibleBefore = view?.before ?? "";

  const inAlias = (pos: number) =>
    paste !== null && pos >= aliasDisplayStart && pos < aliasDisplayEnd;

  // Text at a display position, the pasted block shown in yellow
  const renderSegment = (text: string, posInDisplay: number) => {
    if (text.length === 0) return null;
    const end = posInDisplay + text.length;
    if (!paste || end <= aliasDisplayStart || posInDisplay >= aliasDisplayEnd) {
      return <Text>{text}</Text>;
    }
    if (posInDisplay >= aliasDisplayStart && end <= aliasDisplayEnd) {
      return <Text color="yellow">{text}</Text>;
    }
    const parts: React.ReactNode[] = [];
    let pos = posInDisplay;
    for (const ch of text) {
      parts.push(
        <Text key={pos} color={inAlias(pos) ? "yellow" : undefined}>
          {ch}
        </Text>,
      );
      pos += ch.length;
    }
    return <>{parts}</>;
  };

  const renderLine = (line: InputLine, lineView: LineView, active: boolean) => {
    const vbPos = line.start + lineView.skipChars;
    const vcPos = vbPos + lineView.before.length;
    const vaPos = vcPos + lineView.cursorChar.length;
    return (
      <>
        {lineView.scrollOffset > 0 && <Text dimColor>{"…"}</Text>}
        {renderSegment(lineView.before, vbPos)}
        {active && cursorVisible ? (
          <Text backgroundColor="cyan" color="black">
            {lineView.cursorChar}
          </Text>
        ) : (
          <Text color={inAlias(vcPos) ? "yellow" : undefined}>
            {lineView.cursorChar}
          </Text>
        )}
        {renderSegment(lineView.after, vaPos)}
      </>
    );
  };

  const renderContent = () => {
    if (isEmpty || !view) {
      return (
        <Box ref={lineRef}>
          {cursorVisible ? (
            <Text backgroundColor="cyan" color="black">
              {PLACEHOLDER[0]}
            </Text>
          ) : (
            <Text dimColor>{PLACEHOLDER[0]}</Text>
          )}
          <Text dimColor>{PLACEHOLDER.slice(1)}</Text>
        </Box>
      );
    }

    return visibleLines.map((line, i) => {
      const index = firstVisibleLine + i;
      const active = index === cursorLine;
      return (
        <Box key={line.start} ref={active ? lineRef : undefined}>
          {renderLine(
            line,
            active ? view : layoutLine(line.text, 0, 0, viewWidth),
            active,
          )}
        </Box>
      );
    });
  };

  // Put the terminal's own cursor where the user types, so an IME shows the
  // text being composed in the input line rather than below the screen
  const linePosition = outputPosition(lineRef.current);
  setCursorPosition(
    linePosition && {
      x:
        linePosition.x +
        (shownOffset > 0 ? 1 : 0) +
        displayWidth(visibleBefore),
      y: linePosition.y,
    },
  );

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
        <Box
          ref={boxRef}
          minHeight={3}
          flexDirection="column"
          justifyContent="center"
          overflowX="hidden"
        >
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
            {promptInfo.trust && (
              <Text color="yellow">{t("commandInput.trustHint")}</Text>
            )}
            <Text dimColor>{t("commandInput.pressKey")}</Text>
          </Box>
        )}

        <Box justifyContent="space-between" marginTop={0}>
          <Text color="cyan" bold>
            → {targetLabel}
          </Text>
          <Box gap={3}>
            <Text dimColor>Esc back</Text>
            <Text dimColor>Ctrl+Enter newline</Text>
            <Text dimColor>Enter send</Text>
          </Box>
        </Box>
      </Box>
    </Box>
  );
}
