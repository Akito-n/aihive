import fs from "node:fs";
import path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import { parse, stringify } from "yaml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Types ───────────────────────────────────────────────────────────

export interface AgentConfig {
  name: string;
  role: string; // free-form: "orchestrator", "coordinator", "coder", "reviewer", etc.
  cli?: string; // AI CLI tool: "claude", "codex", "gemini" (default: "claude")
  model?: string; // model identifier (CLI-dependent): "opus", "sonnet", "o3", etc.
  window: string; // tmux window name (auto-derived from role)
  pane?: number; // pane index within window (0-based), auto-derived
}

export interface AihiveConfig {
  session: string; // tmux session name
  agents: AgentConfig[];
}

// ─── Paths ───────────────────────────────────────────────────────────

const CONFIG_DIR = path.join(homedir(), ".aihive");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.yaml");
const INSTRUCTIONS_DIR = path.join(CONFIG_DIR, "instructions");
const BUNDLED_INSTRUCTIONS_DIR = path.join(__dirname, "..", "..", "instructions");

// ─── Default config ──────────────────────────────────────────────────

function defaultConfig(): AihiveConfig {
  const agents = [
    { name: "Orchestrator", role: "orchestrator", model: "opus", window: "", },
    { name: "Coordinator", role: "coordinator", model: "sonnet", window: "" },
    { name: "Worker 1", role: "worker", model: "sonnet", window: "" },
    { name: "Worker 2", role: "worker", model: "sonnet", window: "" },
    { name: "Worker 3", role: "worker", model: "sonnet", window: "" },
    { name: "Worker 4", role: "worker", model: "sonnet", window: "" },
  ];
  return {
    session: "aihive",
    agents: resolveWindowLayout(agents),
  };
}

// ─── Public API ──────────────────────────────────────────────────────

/** Load config from ~/.aihive/config.yaml, creating default if not found */
export function loadConfig(): AihiveConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(defaultConfig());
  }

  const raw = fs.readFileSync(CONFIG_FILE, "utf8");
  const parsed = parse(raw) as AihiveConfig | null;

  if (!parsed || !parsed.agents || parsed.agents.length === 0) {
    return defaultConfig();
  }

  const agents = parsed.agents.map((a) => ({
    name: a.name,
    role: a.role || "worker",
    cli: a.cli || "claude",
    model: a.model || defaultModelForRole(a.role || "worker"),
    window: a.window || "",
    pane: a.pane,
  }));

  return {
    session: parsed.session || "aihive",
    agents: resolveWindowLayout(agents),
  };
}

/** Save config to ~/.aihive/config.yaml */
export function saveConfig(config: AihiveConfig): void {
  ensureConfigDir();
  // Strip window/pane from saved config — they are auto-derived from role
  const saveData = {
    session: config.session,
    agents: config.agents.map((a) => ({
      name: a.name,
      role: a.role,
      ...(a.cli && a.cli !== "claude" ? { cli: a.cli } : {}),
      ...(a.model ? { model: a.model } : {}),
    })),
  };
  const yaml = stringify(saveData, { indent: 2 });
  const header = `# aihive configuration
# Edit this file to customize your agent setup.
#
# Each agent needs:
#   name:   Display name in the TUI
#   role:   Agent role (determines instructions file and window layout)
#   cli:    (optional) AI CLI tool: "claude", "codex", "gemini" (default: "claude")
#   model:  (optional) Model identifier, depends on CLI (default: auto)
#
# Window layout is auto-derived from role:
#   orchestrator, coordinator, reviewer → dedicated window
#   worker → grouped into "workers" window
#   custom roles → grouped by role name
#
# Instructions are loaded from ~/.aihive/instructions/{role}.md
# If not found, bundled defaults are used.
#

`;
  fs.writeFileSync(CONFIG_FILE, header + yaml);
}

/** Get the pane target string for tmux commands */
export function getPaneTarget(agent: AgentConfig): string {
  if (agent.pane != null) {
    return `${agent.window}.${agent.pane}`;
  }
  return agent.window;
}

/** Get the config file path for display */
export function getConfigPath(): string {
  return CONFIG_FILE;
}

/**
 * Resolve the instructions file path for a given role.
 * Priority: ~/.aihive/instructions/{role}.md > bundled instructions/{role}.md
 * Returns undefined if no instructions file exists for the role.
 */
export function getInstructionsPath(role: string): string | undefined {
  const userPath = path.join(INSTRUCTIONS_DIR, `${role}.md`);
  if (fs.existsSync(userPath)) return userPath;

  const bundledPath = path.join(BUNDLED_INSTRUCTIONS_DIR, `${role}.md`);
  if (fs.existsSync(bundledPath)) return bundledPath;

  return undefined;
}

/**
 * Copy bundled instructions to ~/.aihive/instructions/ if they don't exist yet.
 */
export function initInstructions(): void {
  if (!fs.existsSync(INSTRUCTIONS_DIR)) {
    fs.mkdirSync(INSTRUCTIONS_DIR, { recursive: true });
  }

  if (!fs.existsSync(BUNDLED_INSTRUCTIONS_DIR)) return;

  for (const file of fs.readdirSync(BUNDLED_INSTRUCTIONS_DIR)) {
    if (!file.endsWith(".md")) continue;
    const dst = path.join(INSTRUCTIONS_DIR, file);
    if (!fs.existsSync(dst)) {
      fs.copyFileSync(path.join(BUNDLED_INSTRUCTIONS_DIR, file), dst);
    }
  }
}

// ─── Model Defaults ──────────────────────────────────────────────────

function defaultModelForRole(role: string): string {
  if (role === "orchestrator" || role === "scout") return "opus";
  return "sonnet";
}

// ─── Window Layout ───────────────────────────────────────────────────

/** Singleton roles that get their own dedicated tmux window */
const SOLO_ROLES = new Set(["orchestrator", "coordinator", "reviewer", "scout"]);

/**
 * Auto-derive window/pane assignment from agent roles.
 *
 * Rules:
 * - orchestrator, coordinator, reviewer → dedicated window named after the role
 * - worker → grouped into a "workers" window with pane indices
 * - any other custom role → grouped into a window named after the role
 */
export function resolveWindowLayout(agents: AgentConfig[]): AgentConfig[] {
  // Count how many agents share each derived window
  const windowCounts = new Map<string, number>();
  for (const a of agents) {
    const win = deriveWindowName(a.role);
    windowCounts.set(win, (windowCounts.get(win) ?? 0) + 1);
  }

  const windowIndex = new Map<string, number>();
  return agents.map((a) => {
    const win = deriveWindowName(a.role);
    const count = windowCounts.get(win) ?? 1;

    if (count === 1) {
      return { ...a, window: win, pane: undefined };
    }

    const idx = windowIndex.get(win) ?? 0;
    windowIndex.set(win, idx + 1);
    return { ...a, window: win, pane: idx };
  });
}

function deriveWindowName(role: string): string {
  if (SOLO_ROLES.has(role)) return role;
  if (role === "worker") return "workers";
  // Custom roles: group by role name
  return role;
}

// ─── Internal ────────────────────────────────────────────────────────

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}
