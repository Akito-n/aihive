// ─── CLI Registry ────────────────────────────────────────────────────
// Defines supported AI coding CLIs and their command-building logic.

import type { AgentConfig } from "./config.js";
import { getInstructionsPath } from "./config.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface CliDefinition {
  /** Display name */
  name: string;
  /** Binary name to invoke */
  binary: string;
  /** Supported model identifiers */
  models: string[];
  /** Build the full CLI command for an agent */
  buildCommand: (agent: AgentConfig) => string;
}

// ─── Tool Restrictions ───────────────────────────────────────────────

const SCOUT_TOOLS = "Read Write Glob Grep Bash";
const DEFAULT_TOOLS = "Edit Write Read Glob Grep Bash Agent";

// ─── CLI Definitions ─────────────────────────────────────────────────

const claudeCli: CliDefinition = {
  name: "claude",
  binary: "claude",
  models: ["opus", "sonnet", "haiku"],
  buildCommand(agent) {
    const tools = agent.role === "scout" ? SCOUT_TOOLS : DEFAULT_TOOLS;
    const parts = ["claude", "--allowedTools", tools];

    if (agent.model) {
      parts.push(`--model ${agent.model}`);
    }

    const instructionsPath = getInstructionsPath(agent.role);
    if (instructionsPath) {
      parts.push(`--append-system-prompt-file ${instructionsPath}`);
    }

    return parts.join(" ");
  },
};

const codexCli: CliDefinition = {
  name: "codex",
  binary: "codex",
  models: ["default", "o3", "o4-mini"],
  buildCommand(agent) {
    const parts = ["codex", "--no-alt-screen"];

    // "default" = use ~/.codex/config.toml setting, otherwise override via -c
    if (agent.model && agent.model !== "default") {
      parts.push(`-c model="${agent.model}"`);
    }

    if (agent.role === "scout") {
      parts.push("-a suggest");
    } else {
      parts.push("--dangerously-bypass-approvals-and-sandbox");
    }

    return parts.join(" ");
  },
};

const geminiCli: CliDefinition = {
  name: "gemini",
  binary: "gemini",
  models: ["gemini-2.5-pro", "gemini-2.5-flash"],
  buildCommand(agent) {
    const parts = ["gemini"];

    if (agent.model) {
      parts.push(`--model ${agent.model}`);
    }

    // Gemini CLI uses sandbox mode for safety
    if (agent.role === "scout") {
      parts.push("--sandbox");
    }

    return parts.join(" ");
  },
};

// ─── Registry ────────────────────────────────────────────────────────

const CLI_REGISTRY = new Map<string, CliDefinition>([
  ["claude", claudeCli],
  ["codex", codexCli],
  ["gemini", geminiCli],
]);

/** Get a CLI definition by key. Falls back to claude. */
export function getCli(key: string): CliDefinition {
  return CLI_REGISTRY.get(key) ?? claudeCli;
}

/** Get all registered CLI keys */
export function getCliKeys(): string[] {
  return [...CLI_REGISTRY.keys()];
}

/** Get model options for a given CLI */
export function getCliModels(cliKey: string): string[] {
  return getCli(cliKey).models;
}

/** Build the full command for an agent, respecting its CLI setting */
export function buildAgentCommand(agent: AgentConfig): string {
  const cli = getCli(agent.cli ?? "claude");
  return cli.buildCommand(agent);
}
