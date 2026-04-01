import fs from "node:fs";
import path from "node:path";
import { stringify, parse } from "yaml";

// ─── Types ───────────────────────────────────────────────────────────

export interface MemoryEntry {
  id: string;
  key: string;
  value: string;
  tags: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── MemoryManager ──────────────────────────────────────────────────

export class MemoryManager {
  private baseDir: string;
  private entries = new Map<string, MemoryEntry>();

  constructor(projectDir: string) {
    this.baseDir = path.join(projectDir, ".aihive", "memory");
  }

  /** Create memory directories and load existing entries */
  init(agentSlugs: string[]): void {
    fs.mkdirSync(path.join(this.baseDir, "shared"), { recursive: true });
    for (const slug of agentSlugs) {
      fs.mkdirSync(path.join(this.baseDir, slug), { recursive: true });
    }
    this.loadAll();
  }

  /** Write or update a memory entry */
  write(entry: MemoryEntry): void {
    const existing = this.entries.get(entry.id);
    if (existing) {
      entry.updated_at = new Date().toISOString();
    }
    this.entries.set(entry.id, entry);
    this.save(entry);
  }

  /** Read a memory entry by id */
  read(id: string): MemoryEntry | undefined {
    return this.entries.get(id);
  }

  /** Search memories by key, tags, or value substring */
  search(query: string, agentSlug?: string): MemoryEntry[] {
    const lower = query.toLowerCase();
    return [...this.entries.values()].filter((e) => {
      // If agentSlug specified, only match shared or that agent's entries
      if (agentSlug) {
        const isShared = !e.created_by || this.getEntryScope(e) === "shared";
        const isOwn = this.getEntryScope(e) === agentSlug;
        if (!isShared && !isOwn) return false;
      }
      return (
        e.key.toLowerCase().includes(lower) ||
        e.value.toLowerCase().includes(lower) ||
        e.tags.some((t) => t.toLowerCase().includes(lower))
      );
    });
  }

  /** Get all memory entries */
  getAll(): MemoryEntry[] {
    return [...this.entries.values()];
  }

  /** Get total count of memory entries */
  getCount(): number {
    return this.entries.size;
  }

  // ─── Persistence ────────────────────────────────────────────────

  private getEntryScope(entry: MemoryEntry): string {
    // Determine scope from the agent slug (created_by → slug)
    const slug = entry.created_by.toLowerCase().replace(/\s+/g, "-");
    return slug || "shared";
  }

  private save(entry: MemoryEntry): void {
    const scope = this.getEntryScope(entry);
    const dir = path.join(this.baseDir, scope);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${entry.id}.yaml`;
    fs.writeFileSync(
      path.join(dir, filename),
      stringify(entry, { indent: 2 }),
    );
    // Also save to shared if tagged with "shared"
    if (entry.tags.includes("shared") && scope !== "shared") {
      const sharedDir = path.join(this.baseDir, "shared");
      fs.writeFileSync(
        path.join(sharedDir, filename),
        stringify(entry, { indent: 2 }),
      );
    }
  }

  private loadAll(): void {
    if (!fs.existsSync(this.baseDir)) return;

    // Recursively load from all subdirectories
    for (const subdir of fs.readdirSync(this.baseDir)) {
      const dirPath = path.join(this.baseDir, subdir);
      if (!fs.statSync(dirPath).isDirectory()) continue;

      for (const file of fs.readdirSync(dirPath)) {
        if (!file.endsWith(".yaml")) continue;
        try {
          const raw = fs.readFileSync(path.join(dirPath, file), "utf8");
          const data = parse(raw) as MemoryEntry;
          if (data?.id) {
            this.entries.set(data.id, data);
          }
        } catch {
          // Skip malformed files
        }
      }
    }
  }
}
