// ─── Gear ─────────────────────────────────────────────────────────
// Hack-and-slash loot from the dungeon: a base item, a rarity and random
// affixes, or now and then a named unique that may belong to a set. Gear makes the party stronger in the dungeon and can change
// how aihive looks (frame colors, cursor, gauges, logo). It never touches
// prompts, instructions or settings.

import { randomUUID } from "node:crypto";
import type { TransKey } from "../locales/en.js";
import { t } from "./i18n.js";

export type Slot = "weapon" | "armor" | "accessory";
/** Rarities a random roll gives; uniques are named items found apart */
type RolledRarity = "common" | "rare" | "epic" | "legendary";
export type Rarity = RolledRarity | "unique";

export const SLOTS: Slot[] = ["weapon", "armor", "accessory"];
const ROLLED_RARITIES: RolledRarity[] = ["common", "rare", "epic", "legendary"];
export const RARITIES: Rarity[] = [...ROLLED_RARITIES, "unique"];

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
  unique: "redBright",
};

export const RARITY_LABEL_KEYS: Record<Rarity, TransKey> = {
  common: "gear.rarity.common",
  rare: "gear.rarity.rare",
  epic: "gear.rarity.epic",
  legendary: "gear.rarity.legendary",
  unique: "gear.rarity.unique",
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
  /** The named item this is, for unique gear */
  unique?: string;
  /** Times the blacksmith has made it stronger */
  plus?: number;
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
  bronzeAxe: { slot: "weapon", tier: 1, power: 3, name: "gear.base.bronzeAxe" },
  ironSword: { slot: "weapon", tier: 2, power: 5, name: "gear.base.ironSword" },
  wizardStaff: {
    slot: "weapon",
    tier: 2,
    power: 5,
    name: "gear.base.wizardStaff",
  },
  steelSword: {
    slot: "weapon",
    tier: 3,
    power: 8,
    name: "gear.base.steelSword",
  },
  battleAxe: { slot: "weapon", tier: 3, power: 8, name: "gear.base.battleAxe" },
  galaxySword: {
    slot: "weapon",
    tier: 4,
    power: 12,
    name: "gear.base.galaxySword",
  },
  holySpear: {
    slot: "weapon",
    tier: 4,
    power: 12,
    name: "gear.base.holySpear",
  },
  thunderBlade: {
    slot: "weapon",
    tier: 5,
    power: 16,
    name: "gear.base.thunderBlade",
  },
  meteorSword: {
    slot: "weapon",
    tier: 6,
    power: 20,
    name: "gear.base.meteorSword",
  },
  clothes: { slot: "armor", tier: 0, power: 1, name: "gear.base.clothes" },
  leather: { slot: "armor", tier: 1, power: 3, name: "gear.base.leather" },
  travelerCloak: {
    slot: "armor",
    tier: 1,
    power: 3,
    name: "gear.base.travelerCloak",
  },
  chainMail: { slot: "armor", tier: 2, power: 5, name: "gear.base.chainMail" },
  magicRobe: { slot: "armor", tier: 2, power: 5, name: "gear.base.magicRobe" },
  plateMail: { slot: "armor", tier: 3, power: 8, name: "gear.base.plateMail" },
  mirrorArmor: {
    slot: "armor",
    tier: 3,
    power: 8,
    name: "gear.base.mirrorArmor",
  },
  dragonMail: {
    slot: "armor",
    tier: 4,
    power: 12,
    name: "gear.base.dragonMail",
  },
  phoenixRobe: {
    slot: "armor",
    tier: 4,
    power: 12,
    name: "gear.base.phoenixRobe",
  },
  lightArmor: {
    slot: "armor",
    tier: 5,
    power: 16,
    name: "gear.base.lightArmor",
  },
  skyArmor: { slot: "armor", tier: 6, power: 20, name: "gear.base.skyArmor" },
  ring: { slot: "accessory", tier: 0, power: 1, name: "gear.base.ring" },
  glasses: { slot: "accessory", tier: 1, power: 3, name: "gear.base.glasses" },
  powerBracelet: {
    slot: "accessory",
    tier: 1,
    power: 3,
    name: "gear.base.powerBracelet",
  },
  amulet: { slot: "accessory", tier: 2, power: 5, name: "gear.base.amulet" },
  prayerRing: {
    slot: "accessory",
    tier: 2,
    power: 5,
    name: "gear.base.prayerRing",
  },
  boots: { slot: "accessory", tier: 3, power: 8, name: "gear.base.boots" },
  starEarring: {
    slot: "accessory",
    tier: 3,
    power: 8,
    name: "gear.base.starEarring",
  },
  crown: { slot: "accessory", tier: 4, power: 12, name: "gear.base.crown" },
  hourglass: {
    slot: "accessory",
    tier: 4,
    power: 12,
    name: "gear.base.hourglass",
  },
  sageStone: {
    slot: "accessory",
    tier: 5,
    power: 16,
    name: "gear.base.sageStone",
  },
  goddessTiara: {
    slot: "accessory",
    tier: 6,
    power: 20,
    name: "gear.base.goddessTiara",
  },
};

/** The deepest tier of bases */
export const MAX_TIER = 6;

export function tierOf(base: string): number {
  return BASES[base]?.tier ?? 0;
}

/** The deepest tier a floor drops: one more every 8 floors */
export function maxTierAt(floor: number): number {
  return Math.min(MAX_TIER, Math.floor(Math.max(0, floor) / 8));
}

interface Affix {
  name: TransKey;
  power?: number;
  /** Drop chance added while equipped */
  luck?: number;
  look?: Look;
  /** Only found from this floor down */
  minFloor?: number;
}

const RAINBOW = ["red", "yellow", "green", "cyan", "blue", "magenta", "red"];

export const AFFIXES: Record<string, Affix> = {
  sharp: { name: "gear.affix.sharp", power: 3 },
  sturdy: { name: "gear.affix.sturdy", power: 2 },
  swift: { name: "gear.affix.swift", power: 1 },
  lucky: { name: "gear.affix.lucky", luck: 0.05 },
  brave: { name: "gear.affix.brave", power: 4, minFloor: 15 },
  fortune: { name: "gear.affix.fortune", luck: 0.1, minFloor: 20 },
  mighty: { name: "gear.affix.mighty", power: 6, minFloor: 30 },
  crimson: { name: "gear.affix.crimson", look: { frame: "red" } },
  azure: { name: "gear.affix.azure", look: { frame: "blue" } },
  verdant: { name: "gear.affix.verdant", look: { frame: "green" } },
  golden: { name: "gear.affix.golden", look: { frame: "yellow" } },
  shadow: { name: "gear.affix.shadow", look: { frame: "magenta" } },
  snowy: { name: "gear.affix.snowy", look: { frame: "white" } },
  sea: { name: "gear.affix.sea", look: { frame: "cyan" } },
  star: { name: "gear.affix.star", look: { cursor: "★" } },
  heart: { name: "gear.affix.heart", look: { cursor: "♥" } },
  diamond: { name: "gear.affix.diamond", look: { cursor: "◆" } },
  clover: { name: "gear.affix.clover", look: { cursor: "♣" } },
  spade: { name: "gear.affix.spade", look: { cursor: "♠" } },
  sparkle: { name: "gear.affix.sparkle", look: { cursor: "✦" } },
  mottled: { name: "gear.affix.mottled", look: { gauge: "▓" } },
  square: { name: "gear.affix.square", look: { gauge: "■" } },
  misty: { name: "gear.affix.misty", look: { gauge: "▒" } },
  striped: { name: "gear.affix.striped", look: { gauge: "≡" } },
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
  ocean: {
    name: "gear.affix.ocean",
    minFloor: 10,
    look: {
      logo: [
        "cyanBright",
        "cyan",
        "cyan",
        "blueBright",
        "blue",
        "blue",
        "blue",
      ],
    },
  },
  sakura: {
    name: "gear.affix.sakura",
    minFloor: 20,
    look: {
      logo: [
        "whiteBright",
        "magentaBright",
        "magentaBright",
        "magenta",
        "magentaBright",
        "whiteBright",
        "magenta",
      ],
    },
  },
  aurora: {
    name: "gear.affix.aurora",
    minFloor: 35,
    look: {
      logo: [
        "greenBright",
        "green",
        "cyanBright",
        "cyan",
        "blueBright",
        "magentaBright",
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
  unique: 8,
};
const AFFIX_COUNT: Record<RolledRarity, number> = {
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

// ─── Uniques and sets ─────────────────────────────────────────────

interface Unique {
  base: string;
  name: TransKey;
  /** A line of lore shown in the equipment screen and the codex */
  flavor: TransKey;
  affixes: string[];
  /** Only found from this floor down */
  minFloor: number;
  set?: string;
}

export const UNIQUES: Record<string, Unique> = {
  bugNet: {
    base: "copperSword",
    name: "gear.unique.bugNet",
    flavor: "gear.flavor.bugNet",
    affixes: ["lucky"],
    minFloor: 1,
  },
  rubberDuck: {
    base: "ring",
    name: "gear.unique.rubberDuck",
    flavor: "gear.flavor.rubberDuck",
    affixes: ["lucky", "star"],
    minFloor: 5,
  },
  coffeeMug: {
    base: "amulet",
    name: "gear.unique.coffeeMug",
    flavor: "gear.flavor.coffeeMug",
    affixes: ["swift", "brave"],
    minFloor: 10,
  },
  refactorBlade: {
    base: "steelSword",
    name: "gear.unique.refactorBlade",
    flavor: "gear.flavor.refactorBlade",
    affixes: ["sharp"],
    minFloor: 15,
    set: "cleanCode",
  },
  testMail: {
    base: "plateMail",
    name: "gear.unique.testMail",
    flavor: "gear.flavor.testMail",
    affixes: ["sturdy"],
    minFloor: 15,
    set: "cleanCode",
  },
  reviewGlasses: {
    base: "glasses",
    name: "gear.unique.reviewGlasses",
    flavor: "gear.flavor.reviewGlasses",
    affixes: ["lucky", "swift"],
    minFloor: 15,
    set: "cleanCode",
  },
  legacyHammer: {
    base: "battleAxe",
    name: "gear.unique.legacyHammer",
    flavor: "gear.flavor.legacyHammer",
    affixes: ["mighty"],
    minFloor: 25,
  },
  heroSword: {
    base: "galaxySword",
    name: "gear.unique.heroSword",
    flavor: "gear.flavor.heroSword",
    affixes: ["sharp", "brave"],
    minFloor: 30,
    set: "hero",
  },
  heroArmor: {
    base: "dragonMail",
    name: "gear.unique.heroArmor",
    flavor: "gear.flavor.heroArmor",
    affixes: ["sturdy", "brave"],
    minFloor: 30,
    set: "hero",
  },
  heroCrest: {
    base: "crown",
    name: "gear.unique.heroCrest",
    flavor: "gear.flavor.heroCrest",
    affixes: ["fortune"],
    minFloor: 30,
    set: "hero",
  },
  demonSword: {
    base: "meteorSword",
    name: "gear.unique.demonSword",
    flavor: "gear.flavor.demonSword",
    affixes: ["mighty", "sharp"],
    minFloor: 45,
    set: "demonLord",
  },
  demonCloak: {
    base: "skyArmor",
    name: "gear.unique.demonCloak",
    flavor: "gear.flavor.demonCloak",
    affixes: ["mighty", "sturdy"],
    minFloor: 45,
    set: "demonLord",
  },
  demonCrown: {
    base: "goddessTiara",
    name: "gear.unique.demonCrown",
    flavor: "gear.flavor.demonCrown",
    affixes: ["fortune", "brave"],
    minFloor: 45,
    set: "demonLord",
  },
};

interface GearSet {
  name: TransKey;
  /** Extra power for two pieces worn, and for the whole set */
  bonus: [number, number];
  /** The look the whole set gives, over any affix */
  look: Look;
}

export const SETS: Record<string, GearSet> = {
  cleanCode: {
    name: "gear.set.cleanCode",
    bonus: [3, 8],
    look: {
      frame: "green",
      logo: [
        "greenBright",
        "greenBright",
        "green",
        "green",
        "cyan",
        "cyan",
        "green",
      ],
    },
  },
  hero: {
    name: "gear.set.hero",
    bonus: [6, 15],
    look: {
      frame: "yellow",
      cursor: "✦",
      logo: [
        "whiteBright",
        "yellowBright",
        "yellowBright",
        "yellow",
        "yellow",
        "yellowBright",
        "whiteBright",
      ],
    },
  },
  demonLord: {
    name: "gear.set.demonLord",
    bonus: [10, 25],
    look: {
      frame: "magenta",
      cursor: "♠",
      gauge: "▓",
      logo: [
        "magentaBright",
        "magenta",
        "magenta",
        "red",
        "red",
        "gray",
        "gray",
      ],
    },
  },
};

/** The pieces of a set, in unique order */
export function setPieces(set: string): string[] {
  return Object.keys(UNIQUES).filter((u) => UNIQUES[u].set === set);
}

/** The set an item belongs to, if any */
export function setOf(item: Item): string | undefined {
  return item.unique ? UNIQUES[item.unique]?.set : undefined;
}

/** How many pieces of each set the items hold, counting each piece once */
export function setCounts(items: Item[]): Record<string, number> {
  const seen = new Set<string>();
  const counts: Record<string, number> = {};
  for (const item of items) {
    const set = setOf(item);
    if (!set || !item.unique || seen.has(item.unique)) continue;
    seen.add(item.unique);
    counts[set] = (counts[set] ?? 0) + 1;
  }
  return counts;
}

/** Extra power from worn sets */
export function setPower(items: Item[]): number {
  let power = 0;
  for (const [set, count] of Object.entries(setCounts(items))) {
    const [two, all] = SETS[set].bonus;
    if (count >= setPieces(set).length) power += all;
    else if (count >= 2) power += two;
  }
  return power;
}

/** The chance a drop is a unique: bosses guard them better */
export function uniqueChance(boss: boolean): number {
  return boss ? 0.12 : 0.015;
}

/** A unique item; undefined when none can be found this high up */
export function rollUnique(
  floor: number,
  random: () => number = Math.random,
  id: string = randomUUID().slice(0, 8),
): Item | undefined {
  const pool = Object.keys(UNIQUES).filter((u) => UNIQUES[u].minFloor <= floor);
  if (pool.length === 0) return undefined;
  return uniqueItem(pick(pool, random), id);
}

/** A unique item as found, before the blacksmith */
export function uniqueItem(key: string, id: string): Item {
  const u = UNIQUES[key];
  return {
    id,
    base: u.base,
    rarity: "unique",
    affixes: [...u.affixes],
    power: affixedPower(u.base, "unique", u.affixes),
    unique: key,
  };
}

function affixedPower(base: string, rarity: Rarity, affixes: string[]): number {
  return (
    BASES[base].power +
    RARITY_POWER[rarity] +
    affixes.reduce((sum, a) => sum + (AFFIXES[a].power ?? 0), 0)
  );
}

/** A drop from a won battle: sometimes a unique, otherwise a random item */
export function rollDrop(
  floor: number,
  boss: boolean,
  random: () => number = Math.random,
  id: string = randomUUID().slice(0, 8),
): Item {
  if (random() < uniqueChance(boss)) {
    const unique = rollUnique(floor, random, id);
    if (unique) return unique;
  }
  return rollItem(floor, random, id);
}

// ─── Blacksmith ───────────────────────────────────────────────────

/** The blacksmith makes an item stronger up to +9 */
export const MAX_PLUS = 9;

/** Gold for the next +1: more for better bases and higher pluses */
export function upgradeCost(item: Item): number {
  return 20 * ((item.plus ?? 0) + 1) * (tierOf(item.base) + 1);
}

/** Power the next +1 adds */
export function upgradeGain(item: Item): number {
  return 1 + Math.floor(tierOf(item.base) / 2);
}

/** The item one plus stronger, or the same item at the top */
export function upgraded(item: Item): Item {
  const plus = item.plus ?? 0;
  if (plus >= MAX_PLUS) return item;
  return { ...item, plus: plus + 1, power: item.power + upgradeGain(item) };
}

/** Deeper floors drop rarer gear */
export function rarityWeights(floor: number): Record<RolledRarity, number> {
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

function rollRarity(floor: number, random: () => number): RolledRarity {
  const weights = rarityWeights(floor);
  const total = ROLLED_RARITIES.reduce((sum, r) => sum + weights[r], 0);
  let roll = random() * total;
  for (const r of ROLLED_RARITIES) {
    roll -= weights[r];
    if (roll < 0) return r;
  }
  return "common";
}

function lookKinds(affix: string): string[] {
  return Object.keys(AFFIXES[affix].look ?? {});
}

/**
 * A random item for a floor: better bases and rarities deeper down, and a
 * random bonus so two finds of the same item can still differ.
 */
export function rollItem(
  floor: number,
  random: () => number = Math.random,
  id: string = randomUUID().slice(0, 8),
): Item {
  const maxTier = maxTierAt(floor);
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
        (AFFIXES[a].minFloor ?? 0) <= floor &&
        !affixes.includes(a) &&
        !lookKinds(a).some((k) => taken.includes(k)),
    );
    if (pool.length > 0) affixes.push(pick(pool, random));
  }
  const bonus = Math.floor(random() * (BASES[base].tier + 1));
  const power = affixedPower(base, rarity, affixes) + bonus;
  return { id, base, rarity, affixes, power };
}

/** The name with its affixes first, like "Sharp Iron Sword" */
export function itemName(item: Item): string {
  const name = item.unique
    ? t(UNIQUES[item.unique].name)
    : [
        ...item.affixes.map((a) => t(AFFIXES[a].name)),
        t(BASES[item.base].name),
      ].join(" ");
  return item.plus ? `${name} +${item.plus}` : name;
}

/** What the shop pays for an item */
export function sellPrice(item: Item): number {
  return 5 * item.power;
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
    v.power >= 0 &&
    (v.plus === undefined ||
      (Number.isInteger(v.plus) &&
        (v.plus as number) >= 0 &&
        (v.plus as number) <= MAX_PLUS)) &&
    (v.rarity === "unique"
      ? typeof v.unique === "string" &&
        v.unique in UNIQUES &&
        UNIQUES[v.unique].base === v.base
      : v.unique === undefined)
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

/** Worn items' power, with the bonus of any set they make */
export function gearPower(items: Item[]): number {
  return items.reduce((sum, i) => sum + i.power, 0) + setPower(items);
}

export function gearLuck(items: Item[]): number {
  return items.reduce(
    (sum, i) => sum + i.affixes.reduce((s, a) => s + (AFFIXES[a].luck ?? 0), 0),
    0,
  );
}

/** The look the equipped items give; a later slot wins, a whole set wins all */
export function lookOf(items: Item[]): Look {
  const look: Look = {};
  for (const item of items) {
    for (const affix of item.affixes) Object.assign(look, AFFIXES[affix].look);
  }
  for (const [set, count] of Object.entries(setCounts(items))) {
    if (count >= setPieces(set).length) Object.assign(look, SETS[set].look);
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
