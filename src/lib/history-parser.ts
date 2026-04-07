// ─── Claude Code JSONL History Parser ────────────────────────────────
// Reads conversation history from ~/.claude/projects/ and extracts
// user-assistant turns for quality evaluation.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

// ─── Types ───────────────────────────────────────────────────────────

interface JournalEntry {
  type: string;
  subtype?: string;
  uuid?: string;
  parentUuid?: string | null;
  sessionId?: string;
  timestamp?: string;
  message?: {
    role: string;
    content: string | ContentBlock[];
    model?: string;
  };
}

interface ContentBlock {
  type: string;
  text?: string;
  tool_use_id?: string;
}

export interface Turn {
  userText: string;
  assistantText: string;
  timestamp: string;
}

export interface Session {
  sessionId: string;
  filePath: string;
  turns: Turn[];
}

// ─── Constants ───────────────────────────────────────────────────────

const CLAUDE_PROJECTS_DIR = join(homedir(), ".claude", "projects");
const MAX_CONVERSATION_CHARS = 4000;

// ─── Public API ──────────────────────────────────────────────────────

/** Find all JSONL history files across all projects */
export function findHistoryFiles(): { filePath: string; projectDir: string }[] {
  const results: { filePath: string; projectDir: string }[] = [];

  let projectDirs: string[];
  try {
    projectDirs = readdirSync(CLAUDE_PROJECTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return results;
  }

  for (const dir of projectDirs) {
    const projectPath = join(CLAUDE_PROJECTS_DIR, dir);
    try {
      const files = readdirSync(projectPath).filter((f) => f.endsWith(".jsonl"));
      for (const file of files) {
        results.push({
          filePath: join(projectPath, file),
          projectDir: dir,
        });
      }
    } catch {
      // skip unreadable directories
    }
  }

  return results;
}

/** Extract all sessions from a JSONL file */
export function extractSessions(filePath: string): Session[] {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return [];
  }

  const lines = raw.split("\n").filter((l) => l.trim());
  const entries: JournalEntry[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as JournalEntry);
    } catch {
      // skip malformed lines
    }
  }

  // Group by sessionId
  const sessionMap = new Map<string, JournalEntry[]>();

  for (const entry of entries) {
    if (!entry.sessionId) continue;
    if (!isConversationEntry(entry)) continue;

    const list = sessionMap.get(entry.sessionId) ?? [];
    list.push(entry);
    sessionMap.set(entry.sessionId, list);
  }

  const sessions: Session[] = [];

  for (const [sessionId, sessionEntries] of sessionMap) {
    const turns = buildTurns(sessionEntries);
    if (turns.length > 0) {
      sessions.push({ sessionId, filePath, turns });
    }
  }

  return sessions;
}

/** Format a session's conversation for LLM evaluation */
export function formatForEvaluation(session: Session): string {
  const parts: string[] = [];
  let totalLength = 0;

  for (const turn of session.turns) {
    const userLine = `[User]: ${turn.userText}`;
    const assistantLine = `[Assistant]: ${turn.assistantText}`;
    const block = `${userLine}\n${assistantLine}\n`;

    if (totalLength + block.length > MAX_CONVERSATION_CHARS) {
      // Add truncation marker
      const remaining = MAX_CONVERSATION_CHARS - totalLength;
      if (remaining > 50) {
        parts.push(block.slice(0, remaining) + "\n... (truncated)");
      }
      break;
    }

    parts.push(block);
    totalLength += block.length;
  }

  return parts.join("\n");
}

// ─── Internal Helpers ────────────────────────────────────────────────

/** Check if entry is an actual conversation message (not metadata) */
function isConversationEntry(entry: JournalEntry): boolean {
  // Skip metadata types
  if (entry.type === "file-history-snapshot") return false;
  if (entry.type === "last-prompt") return false;
  if (entry.type === "system") return false;

  // Must be user or assistant
  if (entry.type !== "user" && entry.type !== "assistant") return false;

  // Skip tool results (user messages with array content containing tool_result)
  if (entry.type === "user" && entry.message) {
    const content = entry.message.content;
    if (Array.isArray(content)) {
      const hasToolResult = content.some(
        (block) => typeof block === "object" && block.type === "tool_result",
      );
      if (hasToolResult) return false;
    }
  }

  // For user messages, must have string content (actual user prompt)
  if (entry.type === "user") {
    return typeof entry.message?.content === "string" && entry.message.content.trim().length > 0;
  }

  // For assistant messages, must have text content
  if (entry.type === "assistant" && entry.message) {
    const content = entry.message.content;
    if (Array.isArray(content)) {
      return content.some(
        (block) => typeof block === "object" && block.type === "text" && block.text,
      );
    }
  }

  return false;
}

/** Extract text content from an assistant message */
function extractAssistantText(entry: JournalEntry): string {
  if (!entry.message) return "";
  const content = entry.message.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((block): block is ContentBlock & { text: string } =>
        typeof block === "object" && block.type === "text" && typeof block.text === "string",
      )
      .map((block) => block.text)
      .join("\n");
  }
  return "";
}

/** Build user-assistant turn pairs from entries */
function buildTurns(entries: JournalEntry[]): Turn[] {
  // Sort by timestamp
  entries.sort((a, b) =>
    (a.timestamp ?? "").localeCompare(b.timestamp ?? ""),
  );

  const turns: Turn[] = [];
  let pendingUser: { text: string; timestamp: string } | null = null;

  for (const entry of entries) {
    if (entry.type === "user" && typeof entry.message?.content === "string") {
      pendingUser = {
        text: entry.message.content,
        timestamp: entry.timestamp ?? "",
      };
    } else if (entry.type === "assistant" && pendingUser) {
      const assistantText = extractAssistantText(entry);
      if (assistantText) {
        turns.push({
          userText: pendingUser.text,
          assistantText,
          timestamp: pendingUser.timestamp,
        });
        pendingUser = null;
      }
    }
  }

  return turns;
}
