import fs from "node:fs";
import path from "node:path";
import { parse, stringify } from "yaml";

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

  /** Propose a new skill (state = proposed) */
  propose(skill: Skill): void {
    const wasApproved = this.entries.get(skill.id)?.state === "approved";
    const entry: SkillEntry = { skill, state: "proposed" };
    this.entries.set(skill.id, entry);
    this.save(entry);
    if (wasApproved) this.writeIndex();
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
        const data = parse(raw) as Skill & { state?: SkillState };
        if (data?.id) {
          const state = data.state ?? "approved";
          const { state: _, ...skill } = data as Skill & { state?: SkillState };
          this.entries.set(data.id, { skill: skill as Skill, state });
        }
      } catch {
        // Skip malformed files
      }
    }
  }
}

// ─── Index rendering ─────────────────────────────────────────────────

/** Render approved skills as Markdown for agents to read */
export function renderApprovedIndex(skills: Skill[]): string {
  const header =
    "# 承認済みスキル\n\n" +
    "このファイルは aihive が自動生成します。編集しないでください。\n" +
    "作業内容が「適用条件」に当てはまるスキルがあれば、その手順に従ってください。\n";

  if (skills.length === 0) {
    return `${header}\n承認済みスキルはまだありません。\n`;
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
        `- 適用条件: ${s.trigger}`,
        `- 提案: ${s.created_by}${s.approved_by ? ` / 承認: ${s.approved_by}` : ""}`,
        "",
        "### 手順",
        "",
        steps,
      ].join("\n");
    });

  return `${header}\n${sections.join("\n\n")}\n`;
}
