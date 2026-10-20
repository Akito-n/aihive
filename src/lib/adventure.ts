// ─── Adventure ────────────────────────────────────────────────────
// The idle side of the game. Finished tasks grow each member's skills and
// fill exploration points, and the party walks down a dungeon on its own.
// Nothing here is ever read back into prompts, instructions or settings.

import type { TransKey } from "../locales/en.js";
import type { Task } from "./tasks.js";

export type SkillKey = "str" | "vit" | "agi" | "int";
export type Skills = Record<SkillKey, number>;

export const SKILL_KEYS: SkillKey[] = ["str", "vit", "agi", "int"];

export const SKILL_LABEL_KEYS: Record<SkillKey, TransKey> = {
  str: "skill.str",
  vit: "skill.vit",
  agi: "skill.agi",
  int: "skill.int",
};

/** Skill points to reach a skill level: k × (n − 1)², like levels */
export const SKILL_FACTOR = 4;

/** Each job grows one skill faster */
const JOB_SKILL: Record<string, SkillKey> = {
  worker: "str",
  reviewer: "int",
  scout: "agi",
  coordinator: "vit",
  orchestrator: "vit",
};

/** Time spent counts up to this long, so a forgotten task earns no more */
const MAX_TASK_MINUTES = 120;

export function emptySkills(): Skills {
  return { str: 0, vit: 0, agi: 0, int: 0 };
}

export function skillLevel(points: number): number {
  return Math.floor(Math.sqrt(Math.max(0, points) / SKILL_FACTOR)) + 1;
}

export interface SkillContext {
  all: Task[];
  checksPassed: boolean;
  stalled: boolean;
  role: string;
  /** Daily diminishing rate, as for experience */
  rate: number;
  now: number;
}

/**
 * Skill points a finished task earns:
 * ちから from hard tasks, たいりょく from time spent,
 * すばやさ from the number done, かしこさ from clean work.
 */
export function skillGains(task: Task, ctx: SkillContext): Skills {
  const minutes = Math.min(
    MAX_TASK_MINUTES,
    Math.max(0, (ctx.now - Date.parse(task.createdAt)) / 60_000),
  );
  const subtasks = /-\d+$/.test(task.id)
    ? 0
    : ctx.all.filter((t) => t.id.startsWith(`${task.id}-`)).length;
  const gains: Skills = {
    str: subtasks > 0 ? 2 + Math.min(10, 2 * subtasks) : 1,
    vit: Math.floor(minutes / 10),
    agi: 2,
    int: (ctx.checksPassed ? 2 : 0) + (ctx.stalled ? 0 : 1),
  };
  const job = JOB_SKILL[ctx.role];
  if (job) gains[job] = Math.ceil(gains[job] * 1.5);
  for (const key of SKILL_KEYS) gains[key] = Math.round(gains[key] * ctx.rate);
  return gains;
}

// ─── Dungeon ──────────────────────────────────────────────────────

export interface Adventure {
  /** The floor the party is on, from 1 */
  floor: number;
  deepest: number;
  /** Exploration points not yet spent */
  points: number;
  wins: number;
  losses: number;
}

export interface AdventureEvent {
  floor: number;
  monster: TransKey;
  boss: boolean;
  won: boolean;
}

export function emptyAdventure(): Adventure {
  return { floor: 1, deepest: 1, points: 0, wins: 0, losses: 0 };
}

/** Exploration points needed to fight through a floor */
export function floorCost(floor: number): number {
  return 30 + 2 * (floor - 1);
}

export function isBossFloor(floor: number): boolean {
  return floor % 10 === 0;
}

export function enemyPower(floor: number): number {
  const base = 8 + 3 * (floor - 1);
  return Math.round(isBossFloor(floor) ? base * 1.5 : base);
}

/** The party's strength: every member's skills, plus the party level */
export function partyPower(skills: Skills[], partyLevel: number): number {
  let power = 10 + 2 * partyLevel;
  for (const s of skills) {
    power +=
      2 * skillLevel(s.str) +
      skillLevel(s.vit) +
      skillLevel(s.agi) +
      skillLevel(s.int);
  }
  return power;
}

const MONSTERS: TransKey[] = [
  "monster.slime",
  "monster.bat",
  "monster.goblin",
  "monster.skeleton",
  "monster.golem",
  "monster.wraith",
  "monster.chimera",
  "monster.dragon",
];

const BOSSES: TransKey[] = [
  "boss.bugKing",
  "boss.spaghetti",
  "boss.legacy",
  "boss.merge",
];

export function monsterOf(floor: number): TransKey {
  if (isBossFloor(floor)) {
    return BOSSES[Math.min(BOSSES.length - 1, floor / 10 - 1)];
  }
  return MONSTERS[Math.min(MONSTERS.length - 1, Math.floor((floor - 1) / 5))];
}

/** At most this many battles per finished task; leftover points wait */
const MAX_BATTLES = 10;

/**
 * Spend exploration points on floors. A win goes one floor down, a loss
 * goes back one floor; nothing else is lost.
 */
export function explore(
  adventure: Adventure,
  power: number,
  random: () => number = Math.random,
): { adventure: Adventure; events: AdventureEvent[] } {
  const next = { ...adventure };
  const events: AdventureEvent[] = [];
  while (next.points >= floorCost(next.floor) && events.length < MAX_BATTLES) {
    const floor = next.floor;
    next.points -= floorCost(floor);
    // A roll of ±20% keeps an even fight uncertain
    const won = power * (0.8 + 0.4 * random()) >= enemyPower(floor);
    events.push({
      floor,
      monster: monsterOf(floor),
      boss: isBossFloor(floor),
      won,
    });
    if (won) {
      next.wins += 1;
      next.floor = floor + 1;
      next.deepest = Math.max(next.deepest, next.floor);
    } else {
      next.losses += 1;
      next.floor = Math.max(1, floor - 1);
    }
  }
  return { adventure: next, events };
}
