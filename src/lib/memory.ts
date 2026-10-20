import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { asString, asStringList, isSafeId } from "./validate.js";

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
        const isShared =
          !e.created_by ||
          this.getEntryScope(e) === "shared" ||
          e.tags.includes("shared");
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
    // Never let an agent-written name escape the memory directory
    if (!slug || /[/\\]/.test(slug) || slug === "." || slug === "..") {
      return "shared";
    }
    return slug;
  }

  private save(entry: MemoryEntry): void {
    const scope = this.getEntryScope(entry);
    const dir = path.join(this.baseDir, scope);
    fs.mkdirSync(dir, { recursive: true });
    const filename = `${entry.id}.yaml`;
    fs.writeFileSync(path.join(dir, filename), stringify(entry, { indent: 2 }));
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
          const entry = normalizeMemoryEntry(parse(raw));
          if (entry) {
            this.entries.set(entry.id, entry);
          }
        } catch {
          // Skip malformed files
        }
      }
    }
  }
}

// ─── Validation ──────────────────────────────────────────────────────

/**
 * Normalize a memory entry written by an agent. A missing id is generated;
 * returns null when the id is unsafe as a file name or there is no key.
 */
export function normalizeMemoryEntry(
  data: unknown,
  defaultCreatedBy = "",
): MemoryEntry | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  const id =
    d.id ?? `mem-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  if (!isSafeId(id) || typeof d.key !== "string") return null;
  const now = new Date().toISOString();
  return {
    id,
    key: d.key,
    value:
      typeof d.value === "string" ? d.value : JSON.stringify(d.value ?? ""),
    tags: asStringList(d.tags),
    created_by: asString(d.created_by, defaultCreatedBy),
    created_at: asString(d.created_at, now),
    updated_at: asString(d.updated_at, now),
  };
}
