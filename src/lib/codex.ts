// ─── Codex ────────────────────────────────────────────────────────
// What the party has ever found or slain, kept even after gear is sold:
// base items, affixes, uniques and monsters. Game only.

import { type AdventureEvent, ALL_MONSTERS } from "./adventure.js";
import { AFFIXES, BASES, type Item, UNIQUES } from "./gear.js";

export interface Codex {
  bases: string[];
  affixes: string[];
  uniques: string[];
  /** Monsters beaten, by name key, with how many times */
  monsters: Record<string, number>;
}

export type CodexPage = "bases" | "affixes" | "uniques" | "monsters";

export const CODEX_PAGES: CodexPage[] = [
  "bases",
  "affixes",
  "uniques",
  "monsters",
];

export function emptyCodex(): Codex {
  return { bases: [], affixes: [], uniques: [], monsters: {} };
}

/** Every entry a page can hold, in display order */
export function codexEntries(page: CodexPage): string[] {
  switch (page) {
    case "bases":
      return Object.keys(BASES);
    case "affixes":
      return Object.keys(AFFIXES);
    case "uniques":
      return Object.keys(UNIQUES);
    case "monsters":
      return [...ALL_MONSTERS];
  }
}

export function hasEntry(codex: Codex, page: CodexPage, key: string): boolean {
  return page === "monsters"
    ? (codex.monsters[key] ?? 0) > 0
    : codex[page].includes(key);
}

const add = (list: string[], key: string) =>
  list.includes(key) ? list : [...list, key];

/** Note found items' bases, affixes and uniques */
export function recordFinds(codex: Codex, items: Item[]): Codex {
  const next = { ...codex, monsters: { ...codex.monsters } };
  for (const item of items) {
    if (item.base in BASES) next.bases = add(next.bases, item.base);
    for (const affix of item.affixes) {
      if (affix in AFFIXES) next.affixes = add(next.affixes, affix);
    }
    if (item.unique && item.unique in UNIQUES) {
      next.uniques = add(next.uniques, item.unique);
    }
  }
  return next;
}

/** Count the monsters beaten in these battles */
export function recordSlain(codex: Codex, events: AdventureEvent[]): Codex {
  const monsters = { ...codex.monsters };
  for (const e of events) {
    if (e.won) monsters[e.monster] = (monsters[e.monster] ?? 0) + 1;
  }
  return { ...codex, monsters };
}

/** Read a saved codex, keeping only known entries; the bag counts as found */
export function loadCodex(raw: unknown, bag: Item[]): Codex {
  let codex = emptyCodex();
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const known = (value: unknown, page: CodexPage) => {
      const entries = new Set(codexEntries(page));
      return Array.isArray(value)
        ? [
            ...new Set(
              value.filter(
                (k): k is string => typeof k === "string" && entries.has(k),
              ),
            ),
          ]
        : [];
    };
    codex.bases = known(r.bases, "bases");
    codex.affixes = known(r.affixes, "affixes");
    codex.uniques = known(r.uniques, "uniques");
    if (r.monsters && typeof r.monsters === "object") {
      const entries = new Set<string>(ALL_MONSTERS);
      for (const [key, count] of Object.entries(r.monsters)) {
        if (
          entries.has(key) &&
          typeof count === "number" &&
          Number.isFinite(count) &&
          count > 0
        ) {
          codex.monsters[key] = Math.floor(count);
        }
      }
    }
  }
  codex = recordFinds(codex, bag);
  return codex;
}

/** Entries found out of all, for one page or the whole codex */
export function codexCount(
  codex: Codex,
  page?: CodexPage,
): { found: number; total: number } {
  const pages = page ? [page] : CODEX_PAGES;
  let found = 0;
  let total = 0;
  for (const p of pages) {
    const entries = codexEntries(p);
    total += entries.length;
    found += entries.filter((k) => hasEntry(codex, p, k)).length;
  }
  return { found, total };
}

/** Share of the whole codex filled, 0..1 */
export function codexRate(codex: Codex): number {
  const { found, total } = codexCount(codex);
  return total === 0 ? 0 : found / total;
}
