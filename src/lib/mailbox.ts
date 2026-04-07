import { execSync } from "node:child_process";
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
  blocked_by?: string[]; // task IDs that must complete before this message is actionable
}

export type MessageHandler = (message: Message) => void;

/** Mapping from agent slug to tmux pane target for nudge */
export interface NudgeConfig {
  sessionName: string;
  paneTargets: Map<string, string>; // slug → pane target (e.g. "orchestrator" → "orchestrator")
}

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

  /** Create mailbox directories for all agents */
  init(agentNames: string[]): void {
    for (const name of agentNames) {
      const slug = toSlug(name);
      for (const sub of ["inbox", "outbox"]) {
        const dir = path.join(this.baseDir, slug, sub);
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }

  /** Clear all mailbox contents */
  clear(agentNames: string[]): void {
    for (const name of agentNames) {
      const slug = toSlug(name);
      for (const sub of ["inbox", "outbox"]) {
        const dir = path.join(this.baseDir, slug, sub);
        if (!fs.existsSync(dir)) continue;
        for (const file of fs.readdirSync(dir)) {
          fs.unlinkSync(path.join(dir, file));
        }
      }
    }
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

  /** Register a handler for incoming messages */
  onMessage(handler: MessageHandler): void {
    this.handlers.push(handler);
  }

  /** Start watching all agent inboxes for new messages */
  startWatching(agentNames: string[]): void {
    this.pollAgentSlugs = [];

    for (const name of agentNames) {
      const slug = toSlug(name);
      const inboxDir = path.join(this.baseDir, slug, "inbox");
      if (!fs.existsSync(inboxDir)) continue;

      this.pollAgentSlugs.push(slug);

      // Read existing files to mark as seen
      for (const file of fs.readdirSync(inboxDir)) {
        this.seen.add(`${slug}/${file}`);
      }

      const watcher = fs.watch(inboxDir, (_event, filename) => {
        if (!filename?.endsWith(".yaml")) return;
        this.processNewFile(slug, filename);
      });

      this.watchers.set(slug, watcher);
    }

    // Fallback polling to catch events missed by fs.watch (macOS kqueue can drop events)
    this.pollTimer = setInterval(() => this.pollInboxes(), 15_000);
  }

  /** Process a new file in an agent's inbox */
  private processNewFile(slug: string, filename: string): void {
    const key = `${slug}/${filename}`;
    if (this.seen.has(key)) return;
    this.seen.add(key);

    try {
      const filePath = path.join(this.baseDir, slug, "inbox", filename);
      if (!fs.existsSync(filePath)) return;
      const raw = fs.readFileSync(filePath, "utf8").trim();
      if (!raw) return;

      const msg = parse(raw) as Message;
      if (msg?.id) {
        for (const handler of this.handlers) {
          handler(msg);
        }
        // Send tmux nudge to the recipient agent's pane
        this.sendNudge(slug, msg);
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
    if (!this.nudgeConfig) return;
    const { sessionName, paneTargets } = this.nudgeConfig;
    const target = paneTargets.get(agentSlug);
    if (!target) return;

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

    const nudgeText = `[inbox: ${count}件の新着 from ${msg.from}] .aihive/mailbox/${agentSlug}/inbox/ を確認してください`;
    try {
      // Clear any stale input first (needed for codex CLI which preserves input)
      execSync(`tmux send-keys -t ${sessionName}:${target} C-u`, {
        stdio: "ignore",
      });
      execSync(
        `tmux send-keys -t ${sessionName}:${target} ${JSON.stringify(nudgeText)}`,
        { stdio: "ignore" },
      );
      execSync(`tmux send-keys -t ${sessionName}:${target} Enter`, {
        stdio: "ignore",
      });
    } catch {
      // Pane may not exist yet or session ended
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

  /** Get the mailbox base directory */
  getBaseDir(): string {
    return this.baseDir;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

/** Convert agent name to filesystem-safe slug */
function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-");
}
