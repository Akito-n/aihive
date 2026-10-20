// ─── Gear ─────────────────────────────────────────────────────────
// Hack-and-slash loot from the dungeon: a base item, a rarity and random
// affixes. Gear makes the party stronger in the dungeon and can change
// how aihive looks (frame colors, cursor, gauges, logo). It never touches
// prompts, instructions or settings.

import { randomUUID } from "node:crypto";
import type { TransKey } from "../locales/en.js";
import { t } from "./i18n.js";

export type Slot = "weapon" | "armor" | "accessory";
export type Rarity = "common" | "rare" | "epic" | "legendary";

export const SLOTS: Slot[] = ["weapon", "armor", "accessory"];
export const RARITIES: Rarity[] = ["common", "rare", "epic", "legendary"];

export const SLOT_LABEL_KEYS: Record<Slot, TransKey> = {
  weapon: "gear.slot.weapon",
  armor: "gear.slot.armor",
  accessory: "gear.slot.accessory",
};

export const RARITY_COLORS: Record<Rarity, string> = {
  common: "white",
  rare: "cyan",
  epic: "magenta",
  legendary: "yellow",
};

export const RARITY_LABEL_KEYS: Record<Rarity, TransKey> = {
  common: "gear.rarity.common",
  rare: "gear.rarity.rare",
  epic: "gear.rarity.epic",
  legendary: "gear.rarity.legendary",
};

/** What gear can change in the screen's look */
export interface Look {
  frame?: string;
  cursor?: string;
  gauge?: string;
  logo?: string[];
}

export interface Item {
  id: string;
  base: string;
  rarity: Rarity;
  affixes: string[];
  power: number;
}

interface Base {
  slot: Slot;
  tier: number;
  power: number;
  name: TransKey;
}

export const BASES: Record<string, Base> = {
  stick: { slot: "weapon", tier: 0, power: 1, name: "gear.base.stick" },
  copperSword: {
    slot: "weapon",
    tier: 1,
    power: 3,
    name: "gear.base.copperSword",
  },
  ironSword: { slot: "weapon", tier: 2, power: 5, name: "gear.base.ironSword" },
  steelSword: {
    slot: "weapon",
    tier: 3,
    power: 8,
    name: "gear.base.steelSword",
  },
  galaxySword: {
    slot: "weapon",
    tier: 4,
    power: 12,
    name: "gear.base.galaxySword",
  },
  clothes: { slot: "armor", tier: 0, power: 1, name: "gear.base.clothes" },
  leather: { slot: "armor", tier: 1, power: 3, name: "gear.base.leather" },
  chainMail: { slot: "armor", tier: 2, power: 5, name: "gear.base.chainMail" },
  plateMail: { slot: "armor", tier: 3, power: 8, name: "gear.base.plateMail" },
  dragonMail: {
    slot: "armor",
    tier: 4,
    power: 12,
    name: "gear.base.dragonMail",
  },
  ring: { slot: "accessory", tier: 0, power: 1, name: "gear.base.ring" },
  glasses: { slot: "accessory", tier: 1, power: 3, name: "gear.base.glasses" },
  amulet: { slot: "accessory", tier: 2, power: 5, name: "gear.base.amulet" },
  boots: { slot: "accessory", tier: 3, power: 8, name: "gear.base.boots" },
  crown: { slot: "accessory", tier: 4, power: 12, name: "gear.base.crown" },
};

interface Affix {
  name: TransKey;
  power?: number;
  /** Drop chance added while equipped */
  luck?: number;
  look?: Look;
}

const RAINBOW = ["red", "yellow", "green", "cyan", "blue", "magenta", "red"];

export const AFFIXES: Record<string, Affix> = {
  sharp: { name: "gear.affix.sharp", power: 3 },
  sturdy: { name: "gear.affix.sturdy", power: 2 },
  swift: { name: "gear.affix.swift", power: 1 },
  lucky: { name: "gear.affix.lucky", luck: 0.05 },
  crimson: { name: "gear.affix.crimson", look: { frame: "red" } },
  azure: { name: "gear.affix.azure", look: { frame: "blue" } },
  verdant: { name: "gear.affix.verdant", look: { frame: "green" } },
  golden: { name: "gear.affix.golden", look: { frame: "yellow" } },
  star: { name: "gear.affix.star", look: { cursor: "★" } },
  heart: { name: "gear.affix.heart", look: { cursor: "♥" } },
  diamond: { name: "gear.affix.diamond", look: { cursor: "◆" } },
  mottled: { name: "gear.affix.mottled", look: { gauge: "▓" } },
  square: { name: "gear.affix.square", look: { gauge: "■" } },
  rainbow: { name: "gear.affix.rainbow", look: { logo: RAINBOW } },
  frost: {
    name: "gear.affix.frost",
    look: {
      logo: [
        "whiteBright",
        "cyanBright",
        "cyanBright",
        "cyan",
        "cyan",
        "blue",
        "blue",
      ],
    },
  },
  flame: {
    name: "gear.affix.flame",
    look: {
      logo: [
        "yellowBright",
        "yellow",
        "yellow",
        "red",
        "red",
        "red",
        "magenta",
      ],
    },
  },
};

const STAT_AFFIXES = Object.keys(AFFIXES).filter((k) => !AFFIXES[k].look);
const LOOK_AFFIXES = Object.keys(AFFIXES).filter((k) => AFFIXES[k].look);

const RARITY_POWER: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 3,
  legendary: 6,
};
const AFFIX_COUNT: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

/** The bag holds this many; the weakest unequipped item makes room */
export const BAG_LIMIT = 50;

export function slotOf(item: Item): Slot {
  return BASES[item.base].slot;
}

/** Deeper floors drop rarer gear */
export function rarityWeights(floor: number): Record<Rarity, number> {
  const depth = Math.min(50, Math.max(0, floor)) / 50;
  return {
    common: 70 - 21 * depth,
    rare: 22 + 10 * depth,
    epic: 7 + 8 * depth,
    legendary: 1 + 3 * depth,
  };
}

function pick<T>(list: T[], random: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))];
}

function rollRarity(floor: number, random: () => number): Rarity {
  const weights = rarityWeights(floor);
  const total = RARITIES.reduce((sum, r) => sum + weights[r], 0);
  let roll = random() * total;
  for (const r of RARITIES) {
    roll -= weights[r];
    if (roll < 0) return r;
  }
  return "common";
}

function lookKinds(affix: string): string[] {
  return Object.keys(AFFIXES[affix].look ?? {});
}

/** A random item for a floor: better bases and rarities deeper down */
export function rollItem(
  floor: number,
  random: () => number = Math.random,
  id: string = randomUUID().slice(0, 8),
): Item {
  const maxTier = Math.min(4, Math.floor(floor / 8));
  const bases = Object.keys(BASES).filter(
    (b) => BASES[b].tier <= maxTier && BASES[b].tier >= maxTier - 2,
  );
  const base = pick(bases, random);
  const rarity = rollRarity(floor, random);
  const affixes: string[] = [];
  for (let i = 0; i < AFFIX_COUNT[rarity]; i++) {
    // Legendary gear always changes the look
    const wantLook = (rarity === "legendary" && i === 0) || random() < 0.35;
    const taken = affixes.flatMap(lookKinds);
    const pool = (wantLook ? LOOK_AFFIXES : STAT_AFFIXES).filter(
      (a) =>
        !affixes.includes(a) && !lookKinds(a).some((k) => taken.includes(k)),
    );
    if (pool.length > 0) affixes.push(pick(pool, random));
  }
  const power =
    BASES[base].power +
    RARITY_POWER[rarity] +
    affixes.reduce((sum, a) => sum + (AFFIXES[a].power ?? 0), 0);
  return { id, base, rarity, affixes, power };
}

/** The name with its affixes first, like "Sharp Iron Sword" */
export function itemName(item: Item): string {
  return [
    ...item.affixes.map((a) => t(AFFIXES[a].name)),
    t(BASES[item.base].name),
  ].join(" ");
}

/** The drop chance after a won battle; bosses always drop */
export function dropChance(boss: boolean, luck: number): number {
  return boss ? 1 : Math.min(0.6, 0.25 + luck);
}

export function isItem(value: unknown): value is Item {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.base === "string" &&
    v.base in BASES &&
    RARITIES.includes(v.rarity as Rarity) &&
    Array.isArray(v.affixes) &&
    v.affixes.every((a) => typeof a === "string" && a in AFFIXES) &&
    typeof v.power === "number" &&
    Number.isFinite(v.power) &&
    v.power >= 0
  );
}

/** Equipped items in slot order */
export function equippedItems(
  bag: Item[],
  equipped: Partial<Record<Slot, string>>,
): Item[] {
  return SLOTS.flatMap((slot) => {
    const item = bag.find((i) => i.id === equipped[slot]);
    return item ? [item] : [];
  });
}

export function gearPower(items: Item[]): number {
  return items.reduce((sum, i) => sum + i.power, 0);
}

export function gearLuck(items: Item[]): number {
  return items.reduce(
    (sum, i) => sum + i.affixes.reduce((s, a) => s + (AFFIXES[a].luck ?? 0), 0),
    0,
  );
}

/** The look the equipped items give; a later slot wins a clash */
export function lookOf(items: Item[]): Look {
  const look: Look = {};
  for (const item of items) {
    for (const affix of item.affixes) Object.assign(look, AFFIXES[affix].look);
  }
  return look;
}

/** Add drops, dropping the weakest unequipped items past the limit */
export function addToBag(
  bag: Item[],
  drops: Item[],
  equipped: Partial<Record<Slot, string>>,
): Item[] {
  const next = [...bag, ...drops];
  const worn = new Set(Object.values(equipped));
  while (next.length > BAG_LIMIT) {
    let weakest = -1;
    for (let i = 0; i < next.length; i++) {
      if (worn.has(next[i].id)) continue;
      if (weakest < 0 || next[i].power < next[weakest].power) weakest = i;
    }
    if (weakest < 0) break;
    next.splice(weakest, 1);
  }
  return next;
}

/** The look a saved record gives: none while looks are turned off */
export function recordLook(record: {
  bag: Item[];
  equipped: Partial<Record<Slot, string>>;
  looks: boolean;
}): Look {
  return record.looks ? lookOf(equippedItems(record.bag, record.equipped)) : {};
}
