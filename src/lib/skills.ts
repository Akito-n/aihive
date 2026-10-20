import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";
import { t, tf } from "./i18n.js";
import { asString, asStringList, isSafeId } from "./validate.js";

// ─── Types ───────────────────────────────────────────────────────────

export interface Skill {
  id: string;
  name: string;
  description: string;
  trigger: string; // when to apply this skill
  steps: string[]; // execution steps
  created_by: string;
  approved_by?: string;
  created_at: string;
  updated_at: string;
}

export type SkillState = "proposed" | "approved" | "rejected";

interface SkillEntry {
  skill: Skill;
  state: SkillState;
}

/** Generated list of approved skills that agents read before working */
export const APPROVED_INDEX_FILE = "APPROVED.md";

// ─── SkillManager ────────────────────────────────────────────────────

export class SkillManager {
  private skillsDir: string;
  private entries = new Map<string, SkillEntry>();

  constructor(projectDir: string) {
    this.skillsDir = path.join(projectDir, ".aihive", "skills");
  }

  /** Create skills directory and load existing skills */
  init(): void {
    fs.mkdirSync(this.skillsDir, { recursive: true });
    this.loadAll();
    this.writeIndex();
  }

  /** Propose a new skill (state = proposed). Returns false if invalid. */
  propose(data: unknown): boolean {
    const skill = normalizeSkill(data);
    if (!skill) return false;
    const wasApproved = this.entries.get(skill.id)?.state === "approved";
    const entry: SkillEntry = { skill, state: "proposed" };
    this.entries.set(skill.id, entry);
    this.save(entry);
    if (wasApproved) this.writeIndex();
    return true;
  }

  /** Approve a proposed skill */
  approve(id: string, approvedBy: string): boolean {
    const entry = this.entries.get(id);
    if (entry?.state !== "proposed") return false;

    entry.state = "approved";
    entry.skill.approved_by = approvedBy;
    entry.skill.updated_at = new Date().toISOString();
    this.save(entry);
    this.writeIndex();
    return true;
  }

  /** Reject a proposed skill */
  reject(id: string): boolean {
    const entry = this.entries.get(id);
    if (entry?.state !== "proposed") return false;

    entry.state = "rejected";
    entry.skill.updated_at = new Date().toISOString();
    this.save(entry);
    return true;
  }

  /** Get all skills */
  getAll(): SkillEntry[] {
    return [...this.entries.values()];
  }

  /** Get approved skills only */
  getApproved(): Skill[] {
    return this.getAll()
      .filter((e) => e.state === "approved")
      .map((e) => e.skill);
  }

  /** Get counts by state */
  getCounts(): Record<SkillState, number> {
    const counts: Record<SkillState, number> = {
      proposed: 0,
      approved: 0,
      rejected: 0,
    };
    for (const entry of this.entries.values()) {
      counts[entry.state]++;
    }
    return counts;
  }

  /** Find skills matching a trigger keyword */
  findByTrigger(keyword: string): Skill[] {
    const lower = keyword.toLowerCase();
    return this.getApproved().filter(
      (s) =>
        s.trigger.toLowerCase().includes(lower) ||
        s.name.toLowerCase().includes(lower) ||
        s.description.toLowerCase().includes(lower),
    );
  }

  /** Clear all skills */
  clear(): void {
    this.entries.clear();
  }

  // ─── Persistence ────────────────────────────────────────────────

  /** Regenerate APPROVED.md so agents only see approved skills */
  private writeIndex(): void {
    fs.writeFileSync(
      path.join(this.skillsDir, APPROVED_INDEX_FILE),
      renderApprovedIndex(this.getApproved()),
    );
  }

  private save(entry: SkillEntry): void {
    const data = { ...entry.skill, state: entry.state };
    const filename = `${entry.skill.id}.yaml`;
    fs.writeFileSync(
      path.join(this.skillsDir, filename),
      stringify(data, { indent: 2 }),
    );
  }

  private loadAll(): void {
    if (!fs.existsSync(this.skillsDir)) return;

    for (const file of fs.readdirSync(this.skillsDir)) {
      if (!file.endsWith(".yaml")) continue;
      try {
        const raw = fs.readFileSync(path.join(this.skillsDir, file), "utf8");
        const data = parse(raw) as { state?: SkillState } | null;
        const skill = normalizeSkill(data);
        if (skill) {
          const state = data?.state ?? "approved";
          this.entries.set(skill.id, { skill, state });
        }
      } catch {
        // Skip malformed files
      }
    }
  }
}

// ─── Validation ──────────────────────────────────────────────────────

/**
 * Normalize a skill written by an agent. Returns null when the id is missing
 * or unsafe as a file name; other fields fall back to defaults.
 */
export function normalizeSkill(data: unknown): Skill | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!isSafeId(d.id)) return null;
  const now = new Date().toISOString();
  return {
    id: d.id,
    name: asString(d.name, d.id),
    description: asString(d.description),
    trigger: asString(d.trigger),
    steps: asStringList(d.steps),
    created_by: asString(d.created_by, "unknown"),
    ...(typeof d.approved_by === "string"
      ? { approved_by: d.approved_by }
      : {}),
    created_at: asString(d.created_at, now),
    updated_at: asString(d.updated_at, now),
  };
}

// ─── Index rendering ─────────────────────────────────────────────────

/** Render approved skills as Markdown for agents to read */
export function renderApprovedIndex(skills: Skill[]): string {
  const header = `${t("skillsIndex.title")}\n\n${t("skillsIndex.intro")}\n`;

  if (skills.length === 0) {
    return `${header}\n${t("skillsIndex.empty")}\n`;
  }

  const sections = [...skills]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => {
      const steps = s.steps.map((step, i) => `${i + 1}. ${step}`).join("\n");
      return [
        `## ${s.name} (\`${s.id}\`)`,
        "",
        s.description,
        "",
        tf("skillsIndex.trigger", { trigger: s.trigger }),
        tf("skillsIndex.proposedBy", { by: s.created_by }) +
          (s.approved_by
            ? tf("skillsIndex.approvedBy", { by: s.approved_by })
            : ""),
        "",
        t("skillsIndex.steps"),
        "",
        steps,
      ].join("\n");
    });

  return `${header}\n${sections.join("\n\n")}\n`;
}
