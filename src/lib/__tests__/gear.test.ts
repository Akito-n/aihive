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
  MAX_PLUS,
  maxTierAt,
  rarityWeights,
  recordLook,
  rollDrop,
  rollItem,
  rollUnique,
  SETS,
  setCounts,
  setPieces,
  setPower,
  slotOf,
  uniqueChance,
  uniqueItem,
  upgradeCost,
  upgraded,
  upgradeGain,
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
    expect(rollItem(32, rolls(0.99, 0)).base).toBe("hourglass");
    expect(rollItem(40, rolls(0.99, 0)).base).toBe("sageStone");
    expect(rollItem(48, rolls(0.99, 0)).base).toBe("goddessTiara");
    expect(maxTierAt(999)).toBe(6);
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

describe("hack-and-slash rolls", () => {
  beforeEach(() => setLocale("ja"));
  afterEach(() => setLocale("en"));

  it("adds a random bonus up to the base's tier", () => {
    // base, rarity (common), bonus roll
    // Floor 40 drops ranks 3–5; the first is the steel sword (rank 3)
    expect(rollItem(40, rolls(0, 0, 0)).power).toBe(8);
    expect(rollItem(40, rolls(0, 0, 0.99)).power).toBe(8 + 3);
  });

  it("keeps deep affixes off the first floors", () => {
    const deep = ["brave", "fortune", "mighty", "ocean", "sakura", "aurora"];
    for (let seed = 0; seed < 300; seed++) {
      let x = seed + 7;
      const random = () => {
        x = (x * 16807) % 2147483647;
        return x / 2147483647;
      };
      const found = rollItem(1, random);
      expect(found.affixes.some((a) => deep.includes(a))).toBe(false);
    }
  });

  it("sometimes drops a unique, only those found this high up", () => {
    const duck = rollDrop(1, false, rolls(0), "u");
    expect(duck).toMatchObject({ rarity: "unique", unique: "bugNet" });
    expect(isItem(duck)).toBe(true);
    expect(itemName(duck)).toBe("バグとりあみ");
    expect(rollUnique(0, rolls(0))).toBeUndefined();
    // A miss on the unique roll gives a random item
    expect(rollDrop(1, false, rolls(0.5, 0, 0), "r").rarity).not.toBe("unique");
    expect(uniqueChance(true)).toBeGreaterThan(uniqueChance(false));
  });

  it("gives sets a bonus for two pieces and their look for all", () => {
    const sword = uniqueItem("heroSword", "a");
    const armor = uniqueItem("heroArmor", "b");
    const crest = uniqueItem("heroCrest", "c");
    expect(setCounts([sword, armor])).toEqual({ hero: 2 });
    expect(setPower([sword])).toBe(0);
    expect(setPower([sword, armor])).toBe(SETS.hero.bonus[0]);
    expect(setPower([sword, armor, crest])).toBe(SETS.hero.bonus[1]);
    expect(gearPower([sword, armor, crest])).toBe(
      sword.power + armor.power + crest.power + SETS.hero.bonus[1],
    );
    expect(lookOf([sword, armor, crest])).toMatchObject(SETS.hero.look);
    expect(lookOf([sword, armor]).frame).toBeUndefined();
    // The same piece twice is still one piece
    expect(setCounts([sword, { ...sword, id: "z" }])).toEqual({ hero: 1 });
    expect(setPieces("hero")).toEqual(["heroSword", "heroArmor", "heroCrest"]);
  });

  it("lets the blacksmith add pluses up to the top", () => {
    const sword = item({ base: "steelSword", power: 8 });
    expect(upgradeCost(sword)).toBe(80);
    const once = upgraded(sword);
    expect(once).toMatchObject({ plus: 1, power: 8 + upgradeGain(sword) });
    expect(itemName(once)).toBe("はがねのつるぎ +1");
    expect(upgradeCost(once)).toBe(160);
    const top = { ...sword, plus: MAX_PLUS };
    expect(upgraded(top)).toBe(top);
    expect(isItem(top)).toBe(true);
    expect(isItem({ ...sword, plus: MAX_PLUS + 1 })).toBe(false);
    expect(isItem({ ...sword, plus: 1.5 })).toBe(false);
  });

  it("rejects uniques that don't match their base", () => {
    const net = uniqueItem("bugNet", "n");
    expect(isItem({ ...net, base: "stick" })).toBe(false);
    expect(isItem({ ...net, unique: "nope" })).toBe(false);
    expect(isItem({ ...net, unique: undefined })).toBe(false);
    expect(isItem({ ...item(), unique: "bugNet" })).toBe(false);
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
