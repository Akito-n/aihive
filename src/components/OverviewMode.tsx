import { Box, Text, useStdout } from "ink";
import React, { useEffect, useRef, useState } from "react";
import { parseAnsi, stripAnsi } from "../lib/ansi.js";
import type { AgentInfo } from "../lib/tmux.js";
import { capturePane, resizePane } from "../lib/tmux.js";

const ROLE_COLOR: Record<string, string> = {
  orchestrator: "magenta",
  coordinator: "blue",
  worker: "yellow",
  reviewer: "green",
  scout: "cyan",
};

const STATUS_ICON: Record<AgentInfo["status"], string> = {
  pending: "●",
  running: "●",
  done: "●",
  error: "●",
};

const STATUS_COLOR: Record<AgentInfo["status"], string> = {
  pending: "gray",
  running: "yellow",
  done: "green",
  error: "red",
};

interface OverviewModeProps {
  sessionName: string;
  agents: AgentInfo[];
  refreshMs?: number;
}

interface PaneOutput {
  agent: AgentInfo;
  output: string;
}

const COLS = 3;
const CAPTURE_LINES = 12;

export function OverviewMode({
  sessionName,
  agents,
  refreshMs = 2000,
}: OverviewModeProps) {
  const { stdout } = useStdout();
  const [panes, setPanes] = useState<PaneOutput[]>([]);
  const prevOutputsRef = useRef<Map<string, string>>(new Map());

  const totalWidth = stdout?.columns ?? 120;
  const paneWidth = Math.max(30, Math.floor((totalWidth - 4) / COLS) - 2);

  // Resize all panes to fit
  useEffect(() => {
    for (const agent of agents) {
      resizePane(sessionName, agent.paneTarget, paneWidth);
    }
  }, [sessionName, agents, paneWidth]);

  // Capture all panes periodically
  useEffect(() => {
    const update = () => {
      const results: PaneOutput[] = agents.map((agent) => ({
        agent,
        output: capturePane(sessionName, agent.paneTarget, CAPTURE_LINES),
      }));
      const prev = prevOutputsRef.current;
      const changed = results.some((r) => prev.get(r.agent.name) !== r.output);
      if (changed) {
        for (const r of results) prev.set(r.agent.name, r.output);
        setPanes(results);
      }
    };

    update();
    const interval = setInterval(update, refreshMs);
    return () => clearInterval(interval);
  }, [sessionName, agents, refreshMs]);

  // Group into rows of COLS
  const rows: PaneOutput[][] = [];
  for (let i = 0; i < panes.length; i += COLS) {
    rows.push(panes.slice(i, i + COLS));
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="cyan">
          {"📺 Overview Mode"}
        </Text>
        <Text dimColor> — {agents.length} agents | </Text>
        <Text bold color="yellow">
          [O]
        </Text>
        <Text dimColor> to close</Text>
      </Box>

      {rows.map((row, ri) => (
        <Box key={ri} flexDirection="row" gap={1}>
          {row.map((pane) => {
            const color = ROLE_COLOR[pane.agent.role] ?? "white";
            const lines = pane.output
              ? pane.output.split("\n").slice(-CAPTURE_LINES)
              : [];
            return (
              <Box
                key={pane.agent.name}
                flexDirection="column"
                borderStyle="single"
                borderColor={color}
                width={paneWidth}
                height={CAPTURE_LINES + 3}
              >
                <Box paddingX={1} gap={1}>
                  <Text color={STATUS_COLOR[pane.agent.status]}>
                    {STATUS_ICON[pane.agent.status]}
                  </Text>
                  <Text bold color={color}>
                    {pane.agent.name}
                  </Text>
                </Box>
                <Box paddingX={1} flexDirection="column">
                  {lines.length > 0 ? (
                    lines.map((line) => {
                      const lineKey = `${pane.agent.name}-${stripAnsi(line).slice(0, 30)}`;
                      const spans = parseAnsi(line.slice(0, paneWidth * 3));
                      return (
                        <Box key={lineKey}>
                          <Text wrap="truncate">
                            {spans.map((span) => {
                              const spanKey = `${span.text.slice(0, 15)}-${span.fg ?? ""}`;
                              const props: Record<string, unknown> = {
                                key: spanKey,
                              };
                              if (span.fg) props.color = span.fg;
                              if (span.bg) props.backgroundColor = span.bg;
                              if (span.bold) props.bold = true;
                              if (span.dim) props.dimColor = true;
                              if (span.italic) props.italic = true;
                              if (span.underline) props.underline = true;
                              return React.createElement(
                                Text,
                                props,
                                span.text,
                              );
                            })}
                          </Text>
                        </Box>
                      );
                    })
                  ) : (
                    <Text dimColor>Waiting...</Text>
                  )}
                </Box>
              </Box>
            );
          })}
        </Box>
      ))}
    </Box>
  );
}
