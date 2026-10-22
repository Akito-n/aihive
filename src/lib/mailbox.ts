import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { tf } from "./i18n.js";

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
    | "memory-response"
    | "check-result";
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
  /** Called when a notice could not be submitted after every attempt */
  onNudgeFailed?: (agentSlug: string) => void;
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

/** tmux buffer used to paste notices into panes */
const NUDGE_BUFFER = "aihive-nudge";
/** Pause before Enter, so the pasted text has been read as input */
const SETTLE_MS = 300;
/** How long a pane is watched after Enter for signs that the agent started */
const WORKING_CHECK_MS = 1500;
/** Enter presses per notice before it counts as not delivered */
const ENTER_ATTEMPTS = 2;
/** Notices per message before giving up (the stall reminder still follows) */
export const NUDGE_ATTEMPTS = 3;

// ─── MessageBus ──────────────────────────────────────────────────────

export class MessageBus {
  private baseDir: string;
  private watchers = new Map<string, fs.FSWatcher>();
  private handlers: MessageHandler[] = [];
  private seen = new Set<string>();
  private nudgeConfig: NudgeConfig | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private pollAgentSlugs: string[] = [];
  /** Inbox keys whose notice has not been submitted yet → sender */
  private undelivered = new Map<string, string>();
  private nudgeFailures = new Map<string, number>();
  /** Per pane, so two notices never type into one pane at the same time */
  private paneQueues = new Map<string, Promise<boolean>>();
  private wait = (ms: number) =>
    new Promise<void>((resolve) => setTimeout(resolve, ms));

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
        } else if (this.nudgeConfig?.paneTargets.has(slug)) {
          this.undelivered.set(key, oneLine(String(msg.from ?? "")));
          void this.sendNudge(slug);
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
      if (this.undeliveredOf(slug).length > 0 && !this.paneQueues.has(slug)) {
        void this.sendNudge(slug);
      }
    }
  }

  /** Undelivered messages still in the agent's inbox */
  private undeliveredOf(agentSlug: string): string[] {
    const keys: string[] = [];
    for (const key of this.undelivered.keys()) {
      const [slug, file] = key.split("/");
      if (slug !== agentSlug) continue;
      if (fs.existsSync(path.join(this.baseDir, slug, "inbox", file))) {
        keys.push(key);
      } else {
        this.undelivered.delete(key);
      }
    }
    return keys;
  }

  /**
   * Tell the agent about the messages it has not been told about yet. Until
   * the notice is submitted they stay undelivered: the poll tries again, and
   * after NUDGE_ATTEMPTS they are given up on.
   */
  private sendNudge(agentSlug: string): Promise<boolean> {
    return this.enqueue(agentSlug, async () => {
      const keys = this.undeliveredOf(agentSlug);
      if (keys.length === 0) return true;

      // Absolute path: workers run in their own worktree, not the project dir.
      const from = this.undelivered.get(keys[keys.length - 1]) ?? "";
      const dir = path.join(this.baseDir, agentSlug, "inbox");
      const nudgeText = tf("agentMsg.inboxNudge", {
        count: keys.length,
        from,
        dir,
      });
      const delivered = await this.typeIntoPane(agentSlug, nudgeText);

      const failures = delivered
        ? 0
        : (this.nudgeFailures.get(agentSlug) ?? 0) + 1;
      if (delivered || failures >= NUDGE_ATTEMPTS) {
        for (const key of keys) this.undelivered.delete(key);
        this.nudgeFailures.delete(agentSlug);
        this.saveHandled();
      } else {
        this.nudgeFailures.set(agentSlug, failures);
      }
      if (delivered === false) this.nudgeConfig?.onNudgeFailed?.(agentSlug);
      return delivered;
    });
  }

  /** Run after the pane's previous notice has finished */
  private enqueue(
    agentSlug: string,
    job: () => Promise<boolean>,
  ): Promise<boolean> {
    const previous = this.paneQueues.get(agentSlug) ?? Promise.resolve(true);
    const next = previous.then(job, job);
    this.paneQueues.set(agentSlug, next);
    void next.finally(() => {
      if (this.paneQueues.get(agentSlug) === next) {
        this.paneQueues.delete(agentSlug);
      }
    });
    return next;
  }

  /** Remind an agent of a task that has had no update for a while */
  remindStalled(
    agentSlug: string,
    taskId: string,
    minutes: number,
  ): Promise<boolean> {
    const inboxDir = path.join(this.baseDir, agentSlug, "inbox");
    const id = oneLine(taskId);
    return this.enqueue(agentSlug, () =>
      this.typeIntoPane(
        agentSlug,
        tf("agentMsg.stallReminder", {
          id,
          minutes,
          dir: inboxDir,
          processed: PROCESSED_DIR,
        }),
      ),
    );
  }

  /**
   * Paste one line into the agent's tmux pane and submit it. Returns whether
   * the agent started working on it.
   *
   * The text goes in as a bracketed paste, so the CLI sees where it ends:
   * typed fast as keys, Claude Code could take it for a paste that never
   * ended and turn every later Enter into a newline. After Enter the pane
   * must keep changing (the CLI's spinner and timer); a pane that stays the
   * same did not take the line, and Enter is pressed again.
   */
  private async typeIntoPane(
    agentSlug: string,
    text: string,
  ): Promise<boolean> {
    if (!this.nudgeConfig) return false;
    const { sessionName, paneTargets } = this.nudgeConfig;
    const target = paneTargets.get(agentSlug);
    if (!target) return false;
    const pane = `${sessionName}:${target}`;
    try {
      // execFile, not a shell: the text holds values from files agents wrote.
      // Clear any stale input first (needed for codex CLI which preserves input)
      tmux(["send-keys", "-t", pane, "C-u"]);
      tmux(["set-buffer", "-b", NUDGE_BUFFER, "--", text]);
      tmux(["paste-buffer", "-p", "-d", "-b", NUDGE_BUFFER, "-t", pane]);
      for (let attempt = 0; attempt < ENTER_ATTEMPTS; attempt++) {
        await this.wait(SETTLE_MS);
        tmux(["send-keys", "-t", pane, "Enter"]);
        await this.wait(SETTLE_MS);
        const before = capturePane(pane);
        await this.wait(WORKING_CHECK_MS);
        if (capturePane(pane) !== before) return true;
      }
      return false;
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
    this.undelivered.clear();
    this.nudgeFailures.clear();
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
      // Not announced yet: a relaunched aihive should still announce it
      if (this.undelivered.has(key)) continue;
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

function capturePane(pane: string): string {
  return String(
    execFileSync("tmux", ["capture-pane", "-p", "-t", pane], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
  );
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
