import { describe, expect, it } from "vitest";
import {
  codexCount,
  codexEntries,
  codexRate,
  emptyCodex,
  hasEntry,
  loadCodex,
  recordFinds,
  recordSlain,
} from "../codex.js";
import { type Item, uniqueItem } from "../gear.js";

const sword: Item = {
  id: "s",
  base: "ironSword",
  rarity: "rare",
  affixes: ["sharp"],
  power: 9,
};

describe("codex", () => {
  it("notes found bases, affixes and uniques once each", () => {
    const codex = recordFinds(emptyCodex(), [
      sword,
      { ...sword, id: "t" },
      uniqueItem("rubberDuck", "d"),
    ]);
    expect(codex.bases).toEqual(["ironSword", "ring"]);
    expect(codex.affixes).toEqual(["sharp", "lucky", "star"]);
    expect(codex.uniques).toEqual(["rubberDuck"]);
    expect(hasEntry(codex, "bases", "ironSword")).toBe(true);
    expect(hasEntry(codex, "bases", "stick")).toBe(false);
  });

  it("counts monsters beaten, not the ones that won", () => {
    const codex = recordSlain(emptyCodex(), [
      { floor: 1, monster: "monster.slime", boss: false, won: true },
      { floor: 2, monster: "monster.slime", boss: false, won: true },
      { floor: 3, monster: "monster.warning", boss: false, won: false },
    ]);
    expect(codex.monsters).toEqual({ "monster.slime": 2 });
    expect(hasEntry(codex, "monsters", "monster.warning")).toBe(false);
  });

  it("loads only known entries and counts the bag as found", () => {
    const codex = loadCodex(
      {
        bases: ["stick", "nope", 3, "stick"],
        affixes: "sharp",
        uniques: ["heroSword"],
        monsters: { "monster.bat": 3.7, "monster.nope": 2, "boss.merge": -1 },
      },
      [sword],
    );
    expect(codex.bases).toEqual(["stick", "ironSword"]);
    expect(codex.affixes).toEqual(["sharp"]);
    expect(codex.uniques).toEqual(["heroSword"]);
    expect(codex.monsters).toEqual({ "monster.bat": 3 });
    expect(loadCodex(null, [])).toEqual(emptyCodex());
  });

  it("tells how much of each page and the whole is filled", () => {
    const codex = recordFinds(emptyCodex(), [sword]);
    expect(codexCount(codex, "bases")).toEqual({
      found: 1,
      total: codexEntries("bases").length,
    });
    const all = codexCount(codex);
    expect(all.found).toBe(2);
    expect(codexRate(codex)).toBeCloseTo(2 / all.total);
    expect(codexRate(emptyCodex())).toBe(0);
  });
});
