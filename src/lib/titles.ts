// ─── Titles ───────────────────────────────────────────────────────
// Achievements earned from the adventure record. Game only.

import type { TransKey } from "../locales/en.js";
import { isRareMonster } from "./adventure.js";
import { codexRate } from "./codex.js";
import { SETS, setPieces } from "./gear.js";
import type { Progress } from "./progress.js";

interface Title {
  id: string;
  name: TransKey;
  earned: (p: Progress, now: Date) => boolean;
}

/** Uses for a special move to count as mastered (★5) */
const MASTERED_USES = 48;

export const TITLES: Title[] = [
  {
    id: "firstQuest",
    name: "title.firstQuest",
    earned: (p) => p.tasksDone >= 1,
  },
  { id: "veteran", name: "title.veteran", earned: (p) => p.tasksDone >= 100 },
  {
    id: "bossSlayer",
    name: "title.bossSlayer",
    earned: (p) => p.bossesDefeated >= 1,
  },
  {
    id: "deepDiver",
    name: "title.deepDiver",
    earned: (p) => p.adventure.deepest >= 10,
  },
  {
    id: "abyss",
    name: "title.abyss",
    earned: (p) => p.adventure.deepest >= 50,
  },
  {
    id: "legend",
    name: "title.legend",
    earned: (p) => p.bag.some((i) => i.rarity === "legendary"),
  },
  {
    id: "collector",
    name: "title.collector",
    earned: (p) => p.bag.length >= 30,
  },
  {
    id: "uniqueFinder",
    name: "title.uniqueFinder",
    earned: (p) => p.codex.uniques.length >= 1,
  },
  {
    id: "setCollector",
    name: "title.setCollector",
    // Every piece of some set found at least once
    earned: (p) =>
      Object.keys(SETS).some((set) =>
        setPieces(set).every((u) => p.codex.uniques.includes(u)),
      ),
  },
  {
    id: "shinyHunter",
    name: "title.shinyHunter",
    earned: (p) => Object.keys(p.codex.monsters).some(isRareMonster),
  },
  {
    id: "blacksmith",
    name: "title.blacksmith",
    earned: (p) => p.bag.some((i) => (i.plus ?? 0) >= 9),
  },
  {
    id: "scholar",
    name: "title.scholar",
    earned: (p) => codexRate(p.codex) >= 0.5,
  },
  {
    id: "encyclopedia",
    name: "title.encyclopedia",
    earned: (p) => codexRate(p.codex) >= 1,
  },
  {
    id: "apprentice",
    name: "title.apprentice",
    earned: (p) => Object.keys(p.moves).length >= 1,
  },
  {
    id: "master",
    name: "title.master",
    earned: (p) => Object.values(p.moves).some((u) => u >= MASTERED_USES),
  },
  {
    id: "nightOwl",
    name: "title.nightOwl",
    // A task finished between midnight and 4 a.m.
    earned: (_p, now) => now.getHours() < 4,
  },
];

export function titleName(id: string): TransKey | undefined {
  return TITLES.find((t) => t.id === id)?.name;
}

export function isTitleId(id: string): boolean {
  return TITLES.some((t) => t.id === id);
}

/**
 * Add titles the record now earns and return their ids. `taskDone` says a
 * task was just rewarded, which time-of-day titles need.
 */
export function earnTitles(
  progress: Progress,
  now: Date,
  taskDone: boolean,
): string[] {
  const fresh: string[] = [];
  for (const title of TITLES) {
    if (progress.titles.includes(title.id)) continue;
    if (title.id === "nightOwl" && !taskDone) continue;
    if (title.earned(progress, now)) fresh.push(title.id);
  }
  progress.titles = [...progress.titles, ...fresh];
  return fresh;
}
