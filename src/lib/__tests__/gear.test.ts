import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addToBag,
  BAG_LIMIT,
  dropChance,
  equippedItems,
  gearLuck,
  gearPower,
  type Item,
  isItem,
  itemName,
  lookOf,
  rarityWeights,
  recordLook,
  rollItem,
  slotOf,
} from "../gear.js";
import { setLocale } from "../i18n.js";

/** A fixed sequence of rolls, repeating */
function rolls(...values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

function item(overrides: Partial<Item> = {}): Item {
  return {
    id: "a",
    base: "ironSword",
    rarity: "common",
    affixes: [],
    power: 5,
    ...overrides,
  };
}

describe("rollItem", () => {
  it("drops plain early gear from the first floors", () => {
    const found = rollItem(1, rolls(0), "x");
    expect(found).toEqual({
      id: "x",
      base: "stick",
      rarity: "common",
      affixes: [],
      power: 1,
    });
  });

  it("gives legendary gear three affixes, the first changing the look", () => {
    // base pick, rarity roll near the top, then affix rolls
    const found = rollItem(40, rolls(0.99, 0.999, 0.5, 0.9, 0.1, 0.9, 0.2));
    expect(found.rarity).toBe("legendary");
    expect(found.affixes).toHaveLength(3);
    expect(Object.keys(lookOf([found])).length).toBeGreaterThan(0);
    expect(new Set(found.affixes).size).toBe(3);
  });

  it("drops better bases and rarer gear deeper down", () => {
    expect(slotOf(rollItem(40, rolls(0.99, 0)))).toBe("accessory");
    expect(rollItem(40, rolls(0.99, 0)).base).toBe("crown");
    expect(rarityWeights(50).legendary).toBeGreaterThan(
      rarityWeights(1).legendary,
    );
    expect(rarityWeights(50).common).toBeLessThan(rarityWeights(1).common);
  });

  it("never stacks two affixes that change the same part of the look", () => {
    for (let seed = 0; seed < 200; seed++) {
      let x = seed + 1;
      const random = () => {
        x = (x * 16807) % 2147483647;
        return x / 2147483647;
      };
      const found = rollItem(50, random);
      expect(isItem(found)).toBe(true);
      const frames = found.affixes.filter((a) =>
        ["crimson", "azure", "verdant", "golden"].includes(a),
      );
      expect(frames.length).toBeLessThanOrEqual(1);
    }
  });
});

describe("gear", () => {
  beforeEach(() => setLocale("ja"));
  afterEach(() => setLocale("en"));

  it("names an item with its affixes first", () => {
    expect(itemName(item({ affixes: ["sharp", "crimson"] }))).toBe(
      "するどい べにいろの てつのつるぎ",
    );
  });

  it("adds up worn gear's power, luck and look; a later slot wins", () => {
    const sword = item({ id: "s", affixes: ["crimson", "lucky"] });
    const boots = item({ id: "b", base: "boots", affixes: ["azure", "star"] });
    const worn = equippedItems([sword, boots], {
      weapon: "s",
      accessory: "b",
    });
    expect(gearPower(worn)).toBe(10);
    expect(gearLuck(worn)).toBeCloseTo(0.05);
    expect(lookOf(worn)).toEqual({ frame: "blue", cursor: "★" });
    expect(
      recordLook({ bag: [sword], equipped: { weapon: "s" }, looks: false }),
    ).toEqual({});
  });

  it("always drops from bosses and more often with luck", () => {
    expect(dropChance(true, 0)).toBe(1);
    expect(dropChance(false, 0)).toBe(0.25);
    expect(dropChance(false, 0.1)).toBeCloseTo(0.35);
    expect(dropChance(false, 5)).toBe(0.6);
  });

  it("makes room in a full bag by dropping the weakest unworn item", () => {
    const bag = Array.from({ length: BAG_LIMIT }, (_, i) =>
      item({ id: `i${i}`, power: i === 3 ? 0 : 5 }),
    );
    bag[0].power = 0;
    const next = addToBag(bag, [item({ id: "new" })], { weapon: "i0" });
    expect(next).toHaveLength(BAG_LIMIT);
    expect(next.map((i) => i.id)).toContain("i0");
    expect(next.map((i) => i.id)).not.toContain("i3");
    expect(next.map((i) => i.id)).toContain("new");
  });

  it("rejects malformed items", () => {
    expect(isItem(item())).toBe(true);
    expect(isItem(item({ base: "nope" }))).toBe(false);
    expect(isItem(item({ affixes: ["nope"] }))).toBe(false);
    expect(isItem({ ...item(), power: -1 })).toBe(false);
    expect(isItem(null)).toBe(false);
  });
});
