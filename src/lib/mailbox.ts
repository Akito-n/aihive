import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

// ─── Types ───────────────────────────────────────────────────────────

export interface Message {
  id: string;
  from: string;
  to: string;
  type:
    | "task"
    | "result"
    | "error"
    | "status"
    | "info"
    | "consult"
    | "advice"
    | "skill-proposal"
    | "skill-approved"
    | "skill-rejected"
    | "memory-write"
    | "memory-read"
    | "memory-response";
  payload: string;
  timestamp: string;
  task_id?: string; // the task this message belongs to (same id on task, result, error)
  blocked_by?: string[]; // task IDs that must complete before this message is actionable
}

export type MessageHandler = (message: Message) => void;

/** Mapping from agent slug to tmux pane target for nudge */
export interface NudgeConfig {
  sessionName: string;
  paneTargets: Map<string, string>; // slug → pane target (e.g. "orchestrator" → "orchestrator")
}

/**
 * Mailbox handled by aihive itself (memory-read / memory-write). Agents send
 * to it with `to: "system"`; it is always created and watched, never nudged.
 */
export const SYSTEM_MAILBOX = "system";

/** Read messages are moved here (inside each inbox) so the inbox lists only new ones */
export const PROCESSED_DIR = "processed";

/**
 * Inbox files aihive has already handled (`<slug>/<file>` keys), kept in the
 * mailbox dir so a relaunched TUI can tell them apart from messages that
 * arrived while it was closed.
 */
export const HANDLED_FILE = ".handled.json";

// ─── MessageBus ──────────────────────────────────────────────────────

export class MessageBus {
  private baseDir: string;
  private watchers = new Map<string, fs.FSWatcher>();
  private handlers: MessageHandler[] = [];
  private seen = new Set<string>();
  private nudgeConfig: NudgeConfig | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollAgentSlugs: string[] = [];

  constructor(projectDir: string) {
    this.baseDir = path.join(projectDir, ".aihive", "mailbox");
  }

  /** Configure tmux nudge: when a new message arrives in an agent's inbox,
   *  send a minimal notification to their tmux pane */
  setNudgeConfig(config: NudgeConfig): void {
    this.nudgeConfig = config;
  }

  /** Create mailbox directories for all agents and the system mailbox */
  init(agentNames: string[]): void {
    for (const name of withSystem(agentNames)) {
      const slug = toSlug(name);
      for (const sub of ["inbox", "outbox"]) {
        const dir = path.join(this.baseDir, slug, sub);
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /** Clear all mailbox contents */
  clear(agentNames: string[]): void {
    for (const name of withSystem(agentNames)) {
      const slug = toSlug(name);
      for (const sub of ["inbox", "outbox"]) {
        const dir = path.join(this.baseDir, slug, sub);
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
          fs.rmSync(path.join(dir, file), { recursive: true, force: true });
        }
      }
    }
    this.writeHandled([]);
  }

  /** Send a message: write to sender's outbox AND recipient's inbox */
  send(
    from: string,
    to: string,
    type: Message["type"],
    payload: string,
  ): Message {
    const msg: Message = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      from,
      to,
      type,
      payload,
      timestamp: new Date().toISOString(),
    };

    const filename = `${msg.id}.yaml`;
    const yaml = stringify(msg, { indent: 2 });

    // Write to sender's outbox
    const outboxDir = path.join(this.baseDir, toSlug(from), "outbox");
    if (fs.existsSync(outboxDir)) {
      fs.writeFileSync(path.join(outboxDir, filename), yaml);
    }

    // Write to recipient's inbox
    const inboxDir = path.join(this.baseDir, toSlug(to), "inbox");
    if (fs.existsSync(inboxDir)) {
      fs.writeFileSync(path.join(inboxDir, filename), yaml);
    }

    return msg;
  }

  /** Register a handler for incoming messages. Returns an unsubscribe function. */
  onMessage(handler: MessageHandler): () => void {
    this.handlers.push(handler);
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /**
   * Start watching all agent inboxes (and the system inbox) for new messages.
   * Messages already in an inbox that aihive has not handled yet (they arrived
   * while the TUI was closed) are delivered right away, oldest first.
   */
  startWatching(agentNames: string[]): void {
    this.pollAgentSlugs = [];
    const handled = this.readHandled();
    const pending: { slug: string; file: string; mtime: number }[] = [];

    for (const name of withSystem(agentNames)) {
      const slug = toSlug(name);
      const inboxDir = path.join(this.baseDir, slug, "inbox");
      if (!fs.existsSync(inboxDir)) continue;

      this.pollAgentSlugs.push(slug);

      for (const file of fs.readdirSync(inboxDir)) {
        const key = `${slug}/${file}`;
        // Without a record (first run of this version) treat everything as handled
        if (!handled || handled.has(key) || !file.endsWith(".yaml")) {
          this.seen.add(key);
          continue;
        }
        try {
          const { mtimeMs } = fs.statSync(path.join(inboxDir, file));
          pending.push({ slug, file, mtime: mtimeMs });
        } catch {
          // Moved away meanwhile
        }
      }

      const watcher = fs.watch(inboxDir, (_event, filename) => {
        if (!filename?.endsWith(".yaml")) return;
        this.processNewFile(slug, filename);
      });

      this.watchers.set(slug, watcher);
    }

    pending.sort((a, b) => a.mtime - b.mtime);
    for (const { slug, file } of pending) this.processNewFile(slug, file);
    this.saveHandled();

    // Fallback polling to catch events missed by fs.watch (macOS kqueue can drop events)
    this.pollTimer = setInterval(() => this.pollInboxes(), 15_000);
  }

  /** Process a new file in an agent's inbox */
  private processNewFile(slug: string, filename: string): void {
    const key = `${slug}/${filename}`;
    if (this.seen.has(key)) return;

    try {
      const filePath = path.join(this.baseDir, slug, "inbox", filename);
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, "utf8").trim();
      // Empty or partial file (still being written): leave it unseen so the
      // next watch event or poll picks it up once complete.
      if (!raw) return;

      const msg = parse(raw) as Message;
      if (msg?.id) {
        this.seen.add(key);
        for (const handler of this.handlers) {
          try {
            handler(msg);
          } catch {
            // One failing handler must not stop delivery or the nudge
          }
        }
        if (slug === SYSTEM_MAILBOX) {
          // aihive itself is the reader of the system inbox
          archiveMessage(path.join(this.baseDir, slug, "inbox"), filename);
        } else {
          // Send tmux nudge to the recipient agent's pane
          this.sendNudge(slug, msg);
        }
        this.saveHandled();
      }
    } catch {
      // File may be mid-write, ignore
    }
  }

  /** Poll all inboxes for files missed by fs.watch */
  private pollInboxes(): void {
    for (const slug of this.pollAgentSlugs) {
      const inboxDir = path.join(this.baseDir, slug, "inbox");
      try {
        if (!fs.existsSync(inboxDir)) continue;
        for (const file of fs.readdirSync(inboxDir)) {
          if (!file.endsWith(".yaml")) continue;
          this.processNewFile(slug, file);
        }
      } catch {
        // ignore read errors
      }
    }
  }

  /** Send a minimal nudge to the agent's tmux pane */
  private sendNudge(agentSlug: string, msg: Message): void {
    if (!this.nudgeConfig?.paneTargets.has(agentSlug)) return;

    // Count unread messages in inbox
    const inboxDir = path.join(this.baseDir, agentSlug, "inbox");
    let count = 0;
    try {
      count = fs
        .readdirSync(inboxDir)
        .filter((f) => f.endsWith(".yaml")).length;
    } catch {
      count = 1;
    }

    // Absolute path: workers run in their own worktree, not the project dir.
    // One line only: a newline in `from` would submit the prompt early.
    const from = oneLine(String(msg.from ?? ""));
    const nudgeText = `[inbox: ${count}件の新着 from ${from}] ${inboxDir}/ を確認してください`;
    this.typeIntoPane(agentSlug, nudgeText);
  }

  /** Remind an agent of a task that has had no update for a while */
  remindStalled(agentSlug: string, taskId: string, minutes: number): boolean {
    const inboxDir = path.join(this.baseDir, agentSlug, "inbox");
    const id = oneLine(taskId);
    return this.typeIntoPane(
      agentSlug,
      `[aihive] タスク ${id} が ${minutes}分間更新されていません。${inboxDir}/ と ${inboxDir}/${PROCESSED_DIR}/ を確認して作業を続けてください。終わっていれば result、進められなければ error を送ってください`,
    );
  }

  /** Type one line into the agent's tmux pane and submit it */
  private typeIntoPane(agentSlug: string, text: string): boolean {
    if (!this.nudgeConfig) return false;
    const { sessionName, paneTargets } = this.nudgeConfig;
    const target = paneTargets.get(agentSlug);
    if (!target) return false;
    const pane = `${sessionName}:${target}`;
    try {
      // execFile, not a shell: the text holds values from files agents wrote.
      // Clear any stale input first (needed for codex CLI which preserves input)
      tmux(["send-keys", "-t", pane, "C-u"]);
      tmux(["send-keys", "-t", pane, "-l", text]);
      tmux(["send-keys", "-t", pane, "Enter"]);
      return true;
    } catch {
      // Pane may not exist yet or session ended
      return false;
    }
  }

  /** Stop all watchers */
  stopWatching(): void {
    for (const watcher of this.watchers.values()) {
      watcher.close();
    }
    this.watchers.clear();
    this.seen.clear();
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
    this.pollAgentSlugs = [];
  }

  /** Record the handled messages that are still in an inbox */
  private saveHandled(): void {
    const keys: string[] = [];
    for (const key of this.seen) {
      const [slug, file] = key.split("/");
      if (fs.existsSync(path.join(this.baseDir, slug, "inbox", file))) {
        keys.push(key);
      } else {
        // Moved to processed/ or deleted: it cannot come back under this key
        this.seen.delete(key);
      }
    }
    this.writeHandled(keys);
  }

  private writeHandled(keys: string[]): void {
    try {
      fs.mkdirSync(this.baseDir, { recursive: true });
      fs.writeFileSync(
        path.join(this.baseDir, HANDLED_FILE),
        `${JSON.stringify(keys.sort())}\n`,
      );
    } catch {
      // Best effort: without it a relaunch skips messages, as before
    }
  }

  /** Handled keys, or null when there is no usable record */
  private readHandled(): Set<string> | null {
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(this.baseDir, HANDLED_FILE), "utf8"),
      );
      return Array.isArray(parsed)
        ? new Set(parsed.filter((k): k is string => typeof k === "string"))
        : null;
    } catch {
      return null;
    }
  }

  /** Get the mailbox base directory */
  getBaseDir(): string {
    return this.baseDir;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function tmux(args: string[]): void {
  execFileSync("tmux", args, { stdio: "ignore" });
}

/** Move a read message into inbox/processed/ */
export function archiveMessage(inboxDir: string, filename: string): void {
  try {
    const dir = path.join(inboxDir, PROCESSED_DIR);
    fs.mkdirSync(dir, { recursive: true });
    fs.renameSync(path.join(inboxDir, filename), path.join(dir, filename));
  } catch {
    // Already moved by the reader, or gone
  }
}

/** One short line: a newline would submit the prompt early */
function oneLine(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 40);
}

function withSystem(agentNames: string[]): string[] {
  return agentNames.some((n) => toSlug(n) === SYSTEM_MAILBOX)
    ? agentNames
    : [...agentNames, SYSTEM_MAILBOX];
}

/** Convert agent name to filesystem-safe slug */
export function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}
