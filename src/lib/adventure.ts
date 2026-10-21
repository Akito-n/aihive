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
  /** A shiny monster: sure to drop and worth more gold */
  rare?: boolean;
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

/** Two monsters roam each band of five floors, the first one more often */
const BANDS: [TransKey, TransKey][] = [
  ["monster.slime", "monster.warning"],
  ["monster.bat", "monster.nullRat"],
  ["monster.goblin", "monster.magicNumber"],
  ["monster.skeleton", "monster.zombie"],
  ["monster.golem", "monster.flaky"],
  ["monster.wraith", "monster.offByOne"],
  ["monster.chimera", "monster.heisenbug"],
  ["monster.dragon", "monster.stackOverflow"],
  ["monster.yakShaver", "monster.scopeCreep"],
  ["monster.dependencyHell", "monster.cacheGhost"],
  ["monster.timezone", "monster.regexHydra"],
  ["monster.prodFire", "monster.y2k"],
];

const BOSSES: TransKey[] = [
  "boss.bugKing",
  "boss.spaghetti",
  "boss.legacy",
  "boss.merge",
  "boss.monolith",
  "boss.techDebt",
];

/** Shiny monsters that show up now and then and carry treasure */
const RARE_MONSTERS: [TransKey, number][] = [
  ["monster.goldSlime", 1],
  ["monster.platinumBug", 30],
];

/** The chance a battle off the boss floors meets a rare monster */
export const RARE_CHANCE = 0.03;

/** Every monster, in the codex's order */
export const ALL_MONSTERS: TransKey[] = [
  ...BANDS.flat(),
  ...BOSSES,
  ...RARE_MONSTERS.map(([key]) => key),
];

export function isRareMonster(key: string): boolean {
  return RARE_MONSTERS.some(([k]) => k === key);
}

/** Where a monster is met, as a span of floors (to is open for shinies) */
export function monsterHome(
  key: string,
): { from: number; to: number } | undefined {
  const band = BANDS.findIndex((b) => b.includes(key as TransKey));
  if (band >= 0) {
    const to =
      band === BANDS.length - 1 ? Number.POSITIVE_INFINITY : band * 5 + 5;
    return { from: band * 5 + 1, to };
  }
  const boss = BOSSES.indexOf(key as TransKey);
  if (boss >= 0) {
    const floor = (boss + 1) * 10;
    const to = boss === BOSSES.length - 1 ? Number.POSITIVE_INFINITY : floor;
    return { from: floor, to };
  }
  const rare = RARE_MONSTERS.find(([k]) => k === key);
  return rare ? { from: rare[1], to: Number.POSITIVE_INFINITY } : undefined;
}

/** The deepest floors repeat the last band and boss */
export const MAPPED_FLOORS = BANDS.length * 5;

/** Each ten floors is an area with its own name */
const AREAS: TransKey[] = [
  "area.cave",
  "area.forest",
  "area.ruins",
  "area.tower",
  "area.maze",
  "area.abyss",
];

export function areaOf(floor: number): TransKey {
  return AREAS[Math.min(AREAS.length - 1, Math.floor((floor - 1) / 10))];
}

function bandOf(floor: number): [TransKey, TransKey] {
  return BANDS[Math.min(BANDS.length - 1, Math.floor((floor - 1) / 5))];
}

/** The floor's boss, or the monsters roaming it */
export function monstersOf(floor: number): TransKey[] {
  return isBossFloor(floor) ? [monsterOf(floor)] : [...bandOf(floor)];
}

/** The floor's boss, or the monster most often met there */
export function monsterOf(floor: number): TransKey {
  if (isBossFloor(floor)) {
    return BOSSES[Math.min(BOSSES.length - 1, floor / 10 - 1)];
  }
  return bandOf(floor)[0];
}

/** The monster a battle meets: sometimes the band's second, rarely a shiny */
function meetMonster(
  floor: number,
  random: () => number,
): { monster: TransKey; rare: boolean } {
  if (isBossFloor(floor)) return { monster: monsterOf(floor), rare: false };
  if (random() < RARE_CHANCE) {
    const shiny = RARE_MONSTERS.filter(([, from]) => from <= floor).pop();
    if (shiny) return { monster: shiny[0], rare: true };
  }
  const band = bandOf(floor);
  return { monster: random() < 0.35 ? band[1] : band[0], rare: false };
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
    const { monster, rare } = meetMonster(floor, random);
    events.push({
      floor,
      monster,
      boss: isBossFloor(floor),
      won,
      ...(rare ? { rare } : {}),
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
