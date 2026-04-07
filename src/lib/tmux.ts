import { execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildAgentCommand } from "./cli-registry.js";
import type { AgentConfig, AihiveConfig } from "./config.js";
import { getPaneTarget } from "./config.js";

export type AgentStatus = "pending" | "running" | "done" | "error";

export interface AgentInfo {
  name: string;
  role: string;
  cli?: string;
  model?: string;
  status: AgentStatus;
  updatedAt?: string;
  paneTarget: string;
}

export function sessionExists(sessionName: string): boolean {
  try {
    execSync(`tmux has-session -t ${sessionName}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

export function startSession(
  config: AihiveConfig,
  cols?: number,
  rows?: number,
): void {
  const projectDir = process.cwd();
  const width = cols ?? 200;
  const height = rows ?? 50;
  const session = config.session;

  if (sessionExists(session)) {
    execSync(`tmux kill-session -t ${session}`, { stdio: "ignore" });
  }

  // Group agents by window
  const windowMap = new Map<string, AgentConfig[]>();
  for (const agent of config.agents) {
    const list = windowMap.get(agent.window) ?? [];
    list.push(agent);
    windowMap.set(agent.window, list);
  }

  let isFirst = true;
  for (const [windowName, agents] of windowMap) {
    if (isFirst) {
      // Create session with the first window
      execSync(
        `tmux new-session -d -s ${session} -n ${windowName} -x ${width} -y ${height} -c "${projectDir}"`,
      );
      // Disable bracketed paste detection for normal typing (IME, short input)
      execSync(`tmux set -t ${session} assume-paste-time 0`);
      isFirst = false;
    } else {
      execSync(
        `tmux new-window -t ${session} -n ${windowName} -c "${projectDir}"`,
      );
    }

    // If multiple agents in one window, split into panes
    for (let i = 1; i < agents.length; i++) {
      execSync(
        `tmux split-window -t ${session}:${windowName} -c "${projectDir}"`,
      );
      execSync(`tmux select-layout -t ${session}:${windowName} tiled`);
    }

    // Launch claude in each pane with role-specific config
    for (let i = 0; i < agents.length; i++) {
      const target = agents.length > 1 ? `${windowName}.${i}` : windowName;
      sendKeys(session, target, buildAgentCommand(agents[i]));
    }
  }

  // Focus first window
  const firstWindow = config.agents[0]?.window;
  if (firstWindow) {
    execSync(`tmux select-window -t ${session}:${firstWindow}`);
  }
}

export function stopSession(sessionName: string): void {
  if (sessionExists(sessionName)) {
    execSync(`tmux kill-session -t ${sessionName}`, { stdio: "ignore" });
  }
}

/** Resize a tmux window to match the terminal width */
export function resizePane(
  sessionName: string,
  paneTarget: string,
  width: number,
): void {
  try {
    const windowName = paneTarget.split(".")[0];
    execSync(`tmux resize-window -t ${sessionName}:${windowName} -x ${width}`, {
      stdio: "ignore",
    });
  } catch {
    // ignore resize errors
  }
}

/** Capture the last N lines of a tmux pane */
export function capturePane(
  sessionName: string,
  paneTarget: string,
  lines = 20,
): string {
  if (!sessionExists(sessionName)) return "";
  try {
    const output = execSync(
      `tmux capture-pane -e -t ${sessionName}:${paneTarget} -p -S -${lines}`,
      { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] },
    );
    return output.trimEnd();
  } catch {
    return "";
  }
}

/** Send text to a specific pane */
export function sendToPane(
  sessionName: string,
  paneTarget: string,
  text: string,
): void {
  sendKeys(sessionName, paneTarget, text);
}

/** Build agent info list from config */
export function buildAgentList(config: AihiveConfig): AgentInfo[] {
  return config.agents.map((a) => ({
    name: a.name,
    role: a.role,
    cli: a.cli,
    model: a.model,
    status: "pending" as AgentStatus,
    paneTarget: getPaneTarget(a),
  }));
}

const PASTE_THRESHOLD = 100;

function sendKeys(session: string, target: string, text: string): void {
  if (text.length >= PASTE_THRESHOLD) {
    // Long text: write to temp file → load-buffer → paste-buffer
    // Avoids shell metacharacter issues with <<< herestrings
    const tmpFile = path.join(os.tmpdir(), `aihive-paste-${process.pid}.tmp`);
    try {
      fs.writeFileSync(tmpFile, text);
      execSync(`tmux load-buffer -b _aihive_paste ${tmpFile}`);
      execSync(`tmux paste-buffer -b _aihive_paste -t ${session}:${target}`);
      execSync("tmux delete-buffer -b _aihive_paste", { stdio: "ignore" });
      execSync(`tmux send-keys -t ${session}:${target} Enter`);
    } finally {
      try {
        fs.unlinkSync(tmpFile);
      } catch {
        // ignore cleanup errors
      }
    }
  } else {
    execSync(`tmux send-keys -t ${session}:${target} ${JSON.stringify(text)}`);
    execSync(`tmux send-keys -t ${session}:${target} Enter`);
  }
}
