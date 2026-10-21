// ─── Model Resolver ──────────────────────────────────────────────────
// Agents keep Claude Code aliases ("opus") so they follow new models
// automatically. To show which version an alias means right now, ask
// Claude Code: its first stream-json event ("system" / "init") names the
// resolved model before any request is sent, so the process is stopped there.

import { spawn } from "node:child_process";
import fs from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";

const CACHE_FILE = path.join(homedir(), ".aihive", "models.json");
const RESOLVE_TIMEOUT_MS = 30_000;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:[\]-]{0,99}$/;

/** Claude Code aliases that aihive offers and resolves */
export const CLAUDE_ALIASES = ["opus", "sonnet", "haiku", "fable"];

let resolved: Record<string, string> = {};
const listeners = new Set<() => void>();

/** Get notified when resolved models change; returns an unsubscribe function */
export function onResolvedModelsChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Read the cached alias → model ID map (call once at startup) */
export function loadResolvedModels(): void {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    resolved = sanitize(data?.claude);
  } catch {
    resolved = {};
  }
}

/** Replace the in-memory map (tests) */
export function setResolvedModels(map: Record<string, string>): void {
  resolved = sanitize(map);
}

function sanitize(map: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!map || typeof map !== "object") return out;
  for (const alias of CLAUDE_ALIASES) {
    const id = (map as Record<string, unknown>)[alias];
    if (typeof id === "string" && MODEL_ID.test(id)) out[alias] = id;
  }
  return out;
}

/** "claude-opus-5-5" → "Opus 5.5"; other IDs are returned unchanged */
export function prettyModelId(id: string): string {
  const m = /^claude-([a-z]+)-(\d+)-(\d+)(?:-\d{8})?$/.exec(id);
  if (!m) return id;
  const [, family, major, minor] = m;
  return `${family[0].toUpperCase()}${family.slice(1)} ${major}.${minor}`;
}

/** Short name for status lines: "Opus 5.5" once resolved, else the raw value */
export function modelName(cli: string | undefined, model: string): string {
  if ((cli ?? "claude") !== "claude") return model;
  const id = resolved[model];
  return id ? prettyModelId(id) : model;
}

/** Label for pickers: "opus (Opus 5.5)" once resolved, else the raw value */
export function modelOptionLabel(
  cli: string | undefined,
  model: string,
): string {
  const name = modelName(cli, model);
  return name === model ? model : `${model} (${name})`;
}

/** Pull the resolved model from one stream-json line, if it is the init event */
export function parseInitModel(line: string): string | undefined {
  try {
    const event = JSON.parse(line);
    if (event?.type !== "system" || event?.subtype !== "init") return;
    const model = event.model;
    return typeof model === "string" && MODEL_ID.test(model)
      ? model
      : undefined;
  } catch {
    return undefined;
  }
}

/** Ask Claude Code which model an alias resolves to; undefined on failure */
export function resolveClaudeAlias(alias: string): Promise<string | undefined> {
  return new Promise((resolve) => {
    let done = false;
    let buffer = "";
    const child = spawn(
      "claude",
      [
        "-p",
        "--model",
        alias,
        "--output-format",
        "stream-json",
        "--verbose",
        "--no-session-persistence",
        "--strict-mcp-config",
        "x",
      ],
      { cwd: tmpdir(), stdio: ["ignore", "pipe", "ignore"] },
    );
    const finish = (model?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      child.kill();
      resolve(model);
    };
    const timer = setTimeout(() => finish(), RESOLVE_TIMEOUT_MS);
    child.on("error", () => finish());
    child.on("close", () => finish());
    child.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      let nl = buffer.indexOf("\n");
      while (nl !== -1) {
        const model = parseInitModel(buffer.slice(0, nl));
        if (model) return finish(model);
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
      }
    });
  });
}

/** Resolve the given aliases, update the cache, and report whether anything changed */
export async function refreshResolvedModels(
  aliases: string[] = CLAUDE_ALIASES,
  resolver: (alias: string) => Promise<string | undefined> = resolveClaudeAlias,
): Promise<boolean> {
  const results = await Promise.all(
    aliases.map(async (a) => [a, await resolver(a)] as const),
  );
  const next = { ...resolved };
  for (const [alias, id] of results) if (id) next[alias] = id;
  const clean = sanitize(next);
  const changed = JSON.stringify(clean) !== JSON.stringify(resolved);
  resolved = clean;
  if (changed) {
    try {
      fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
      fs.writeFileSync(
        CACHE_FILE,
        `${JSON.stringify({ claude: clean }, null, 2)}\n`,
      );
    } catch {
      // cache is best-effort
    }
    for (const listener of listeners) listener();
  }
  return changed;
}
