import { Box, Text } from "ink";
import React, { useEffect, useRef, useState } from "react";
import { parseAnsi, stripAnsi } from "../lib/ansi.js";
import { capturePane } from "../lib/tmux.js";

// Patterns that indicate Claude Code is waiting for user choice
const PROMPT_PATTERNS = [
  /^\s*[›>]\s*\d+\.\s/m, // › 1. Yes / > 1. Yes
  /Do you want to/i, // "Do you want to overwrite..."
  /\(y\/n\)/i, // (y/n) prompt
  /\(Y\/n\)/, // (Y/n) prompt
  /Esc to cancel/, // Claude Code choice UI
];

export interface PromptInfo {
  detected: boolean;
  options: string[];
}

interface PaneViewProps {
  sessionName: string;
  paneTarget: string;
  label: string;
  active: boolean;
  lines?: number;
  refreshMs?: number;
  onPromptChange?: (info: PromptInfo) => void;
}

/** Detect if a tmux pane output contains a prompt waiting for user input */
export function detectPrompt(text: string): PromptInfo {
  const hasPrompt = PROMPT_PATTERNS.some((p) => p.test(text));
  if (!hasPrompt) return { detected: false, options: [] };

  // Extract numbered options like "1. Yes", "2. Yes, allow all..."
  const options: string[] = [];
  const optionMatches = text.matchAll(/^\s*[›>]?\s*(\d+)\.\s+(.+)$/gm);
  for (const m of optionMatches) {
    options.push(`${m[1]}. ${m[2].trim()}`);
  }

  // Check for y/n
  if (/\(y\/n\)/i.test(text) || /\(Y\/n\)/.test(text)) {
    if (options.length === 0) {
      options.push("y", "n");
    }
  }

  return { detected: true, options };
}

export function PaneView({
  sessionName,
  paneTarget,
  label,
  active,
  lines = 15,
  refreshMs = 2000,
  onPromptChange,
}: PaneViewProps) {
  const [output, setOutput] = useState("");
  const prevOutputRef = useRef("");
  useEffect(() => {
    const update = () => {
      const captured = capturePane(sessionName, paneTarget, lines);
      if (captured !== prevOutputRef.current) {
        prevOutputRef.current = captured;
        setOutput(captured);
        if (onPromptChange) {
          onPromptChange(detectPrompt(stripAnsi(captured)));
        }
      }
    };

    update();
    const interval = setInterval(update, refreshMs);
    return () => clearInterval(interval);
  }, [sessionName, paneTarget, lines, refreshMs, onPromptChange]);

  // height = lines + border(2) + label(1) + marginTop(1)
  const boxHeight = lines + 4;
  const outputLines = output ? output.split("\n") : [];
  // Show only the last `lines` rows so content auto-scrolls to bottom
  const visibleLines = outputLines.slice(-lines);

  return (
    <Box
      flexDirection="column"
      borderStyle={active ? "double" : "single"}
      borderColor={active ? "cyan" : "gray"}
      paddingX={1}
      flexGrow={1}
      height={boxHeight}
      overflow="hidden"
    >
      <Text bold color={active ? "cyan" : "white"}>
        {label}
      </Text>
      <Box marginTop={1} flexDirection="column">
        {visibleLines.length > 0 ? (
          visibleLines.map((line, lineIdx) => {
            const spans = parseAnsi(line);
            return (
              <Box key={`${paneTarget}-${lineIdx}`}>
                <Text wrap="truncate">
                  {spans.map((span, spanIdx) => {
                    const props: Record<string, unknown> = { key: `${lineIdx}-${spanIdx}` };
                    if (span.fg) props.color = span.fg;
                    if (span.bg) props.backgroundColor = span.bg;
                    if (span.bold) props.bold = true;
                    if (span.dim) props.dimColor = true;
                    if (span.italic) props.italic = true;
                    if (span.underline) props.underline = true;
                    if (span.inverse) props.inverse = true;
                    if (span.strikethrough) props.strikethrough = true;
                    return React.createElement(Text, props, span.text);
                  })}
                </Text>
              </Box>
            );
          })
        ) : (
          <Text dimColor>Waiting for output...</Text>
        )}
      </Box>
    </Box>
  );
}
