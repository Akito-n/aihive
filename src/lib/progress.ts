// ─── Progress ─────────────────────────────────────────────────────
// aihive's own adventure record: the party's and each member's experience,
// kept across sessions and projects in ~/.aihive/progress.json.

import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { toSlug } from "./mailbox.js";
import type { Task } from "./tasks.js";

export interface MemberProgress {
  name: string;
  role: string;
  xp: number;
  tasksDone: number;
}

export interface Progress {
  version: 1;
  partyXp: number;
  tasksDone: number;
  bossesDefeated: number;
  members: Record<string, MemberProgress>; // by agent slug
  /** Tasks already rewarded, as "<project>#<task id>" (newest last) */
  counted: string[];
  /** Tasks rewarded today, for diminishing returns */
  today: { date: string; count: number };
}

/** XP to reach a level grows with its square: XP(n) = k × (n − 1)² */
export const PARTY_XP_FACTOR = 50;
export const MEMBER_XP_FACTOR = 25;

/** Rewards for one finished task */
export const XP = {
  task: 20,
  subtask: 10,
  checksPassed: 10,
  neverStalled: 5,
  boss: 30,
} as const;

/** Tasks finished within this long earned nothing (made and closed at once) */
const MIN_TASK_MS = 60_000;
/** How many rewarded tasks are remembered, so none is rewarded twice */
const COUNTED_LIMIT = 5000;

export function levelForXp(xp: number, factor: number): number {
  return Math.floor(Math.sqrt(Math.max(0, xp) / factor)) + 1;
}

export function xpForLevel(level: number, factor: number): number {
  return factor * (level - 1) ** 2;
}

/** Share of the next level reached, 0..1 */
export function levelProgress(xp: number, factor: number): number {
  const level = levelForXp(xp, factor);
  const from = xpForLevel(level, factor);
  const to = xpForLevel(level + 1, factor);
  return (xp - from) / (to - from);
}

export function emptyProgress(): Progress {
  return {
    version: 1,
    partyXp: 0,
    tasksDone: 0,
    bossesDefeated: 0,
    members: {},
    counted: [],
    today: { date: "", count: 0 },
  };
}

export function progressFilePath(): string {
  return path.join(homedir(), ".aihive", "progress.json");
}

const isCount = (v: unknown): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= 0;

/** Read the record; anything missing or malformed starts from zero */
export function loadProgress(file = progressFilePath()): Progress {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return emptyProgress();
  }
  const p = emptyProgress();
  if (!raw || typeof raw !== "object") return p;
  const r = raw as Record<string, unknown>;
  if (isCount(r.partyXp)) p.partyXp = Math.floor(r.partyXp);
  if (isCount(r.tasksDone)) p.tasksDone = Math.floor(r.tasksDone);
  if (isCount(r.bossesDefeated))
    p.bossesDefeated = Math.floor(r.bossesDefeated);
  if (r.members && typeof r.members === "object") {
    for (const [slug, m] of Object.entries(r.members)) {
      const v = m as Record<string, unknown>;
      if (v && typeof v.name === "string" && isCount(v.xp)) {
        p.members[slug] = {
          name: v.name,
          role: typeof v.role === "string" ? v.role : "",
          xp: Math.floor(v.xp),
          tasksDone: isCount(v.tasksDone) ? Math.floor(v.tasksDone) : 0,
        };
      }
    }
  }
  if (Array.isArray(r.counted)) {
    p.counted = r.counted.filter((k): k is string => typeof k === "string");
  }
  const today = r.today as Record<string, unknown> | undefined;
  if (today && typeof today.date === "string" && isCount(today.count)) {
    p.today = { date: today.date, count: Math.floor(today.count) };
  }
  return p;
}

/** Write through a temp file, so a crash never leaves half a record */
export function saveProgress(progress: Progress, file = progressFilePath()) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(progress, null, 2)}\n`);
  fs.renameSync(tmp, file);
}

export function isSubtask(id: string): boolean {
  return /-\d+$/.test(id);
}

/** A parent task whose subtasks are all done: a boss defeated */
export function isBoss(task: Task, all: Task[]): boolean {
  if (isSubtask(task.id)) return false;
  const subtasks = all.filter((t) => t.id.startsWith(`${task.id}-`));
  return subtasks.length > 0 && subtasks.every((t) => t.state === "done");
}

export interface TaskContext {
  all: Task[];
  checksPassed: boolean;
  stalled: boolean;
  /** Tasks already rewarded today */
  todayCount: number;
  now: number;
}

/** The XP a finished task earns, before anything is saved */
export function taskXp(task: Task, ctx: TaskContext): number {
  if (ctx.now - Date.parse(task.createdAt) < MIN_TASK_MS) return 0;
  let xp = isSubtask(task.id) ? XP.subtask : XP.task;
  if (ctx.checksPassed) xp += XP.checksPassed;
  if (!ctx.stalled) xp += XP.neverStalled;
  if (isBoss(task, ctx.all)) xp += XP.boss;
  // Many tasks in one day earn less, so splitting work finely doesn't pay
  const rate = ctx.todayCount >= 50 ? 0.25 : ctx.todayCount >= 20 ? 0.5 : 1;
  return Math.round(xp * rate);
}

export interface Award {
  xp: number;
  member: string;
  memberLevel: { before: number; after: number };
  partyLevel: { before: number; after: number };
  boss: boolean;
  progress: Progress;
}

function localDate(now: number): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Reward a finished task once. Reads the record fresh and writes it back,
 * so another aihive running at the same time doesn't lose its gains.
 * Returns undefined when the task was already rewarded.
 */
export function awardTask(
  input: {
    project: string;
    task: Task;
    member: { name: string; role: string };
    checksPassed: boolean;
    stalled: boolean;
    all: Task[];
    now?: number;
  },
  file = progressFilePath(),
): Award | undefined {
  const now = input.now ?? Date.now();
  const progress = loadProgress(file);
  const key = `${input.project}#${input.task.id}`;
  if (progress.counted.includes(key)) return undefined;

  const date = localDate(now);
  if (progress.today.date !== date) progress.today = { date, count: 0 };
  const xp = taskXp(input.task, {
    all: input.all,
    checksPassed: input.checksPassed,
    stalled: input.stalled,
    todayCount: progress.today.count,
    now,
  });
  const boss = isBoss(input.task, input.all);

  const slug = toSlug(input.member.name);
  const member = progress.members[slug] ?? {
    name: input.member.name,
    role: input.member.role,
    xp: 0,
    tasksDone: 0,
  };
  const memberBefore = levelForXp(member.xp, MEMBER_XP_FACTOR);
  const partyBefore = levelForXp(progress.partyXp, PARTY_XP_FACTOR);
  member.xp += xp;
  member.tasksDone += 1;
  member.name = input.member.name;
  member.role = input.member.role;
  progress.members[slug] = member;
  progress.partyXp += xp;
  progress.tasksDone += 1;
  if (boss) progress.bossesDefeated += 1;
  progress.today.count += 1;
  progress.counted = [...progress.counted, key].slice(-COUNTED_LIMIT);
  saveProgress(progress, file);

  return {
    xp,
    member: input.member.name,
    memberLevel: {
      before: memberBefore,
      after: levelForXp(member.xp, MEMBER_XP_FACTOR),
    },
    partyLevel: {
      before: partyBefore,
      after: levelForXp(progress.partyXp, PARTY_XP_FACTOR),
    },
    boss,
    progress,
  };
}

/** A member's level by display name; 1 for someone new */
export function memberLevelOf(progress: Progress, name: string): number {
  const m = progress.members[toSlug(name)];
  return levelForXp(m?.xp ?? 0, MEMBER_XP_FACTOR);
}

export function partyLevelOf(progress: Progress): number {
  return levelForXp(progress.partyXp, PARTY_XP_FACTOR);
}
