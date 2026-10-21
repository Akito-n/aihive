import { render } from "ink-testing-library";
import { beforeEach, describe, expect, it } from "vitest";
import { recordFinds, recordSlain } from "../../lib/codex.js";
import { uniqueItem } from "../../lib/gear.js";
import { setLocale } from "../../lib/i18n.js";
import { emptyProgress } from "../../lib/progress.js";
import { affixEffect, CodexView, floorSpan } from "../CodexView.js";
import { EquipView } from "../EquipView.js";
import { MapView, mapRows, oddsColor } from "../MapView.js";

const tick = () => new Promise((r) => setTimeout(r, 20));

describe("CodexView", () => {
  beforeEach(() => setLocale("ja"));

  it("shows found entries and hides the rest", async () => {
    const progress = emptyProgress();
    progress.codex = recordFinds(progress.codex, [
      {
        id: "s",
        base: "stick",
        rarity: "rare",
        affixes: ["sharp"],
        power: 4,
      },
    ]);
    const { lastFrame, stdin } = render(
      <CodexView progress={progress} height={40} onClose={() => {}} />,
    );
    let frame = lastFrame() ?? "";
    expect(frame).toMatch(/ずかん 2\/\d+/);
    expect(frame).toContain("[そうび 1/33]");
    expect(frame).toContain("きのぼう");
    expect(frame).toContain("？？？？");
    await tick();
    stdin.write("l");
    await tick();
    frame = lastFrame() ?? "";
    expect(frame).toContain("[こうか 1/");
    expect(frame).toContain("するどい");
    expect(frame).toContain("つよさ+3");
  });

  it("tells a unique's lore and a monster's home once found", async () => {
    const progress = emptyProgress();
    progress.codex = recordSlain(
      recordFinds(progress.codex, [uniqueItem("bugNet", "n")]),
      [{ floor: 1, monster: "monster.slime", boss: false, won: true }],
    );
    const { lastFrame, stdin } = render(
      <CodexView progress={progress} height={40} onClose={() => {}} />,
    );
    await tick();
    stdin.write("l");
    await tick();
    stdin.write("l");
    await tick();
    expect(lastFrame()).toContain("バグとりあみ");
    expect(lastFrame()).toContain("かえる まえの バグを");
    stdin.write("l");
    await tick();
    expect(lastFrame()).toContain("バグスライム");
    expect(lastFrame()).toContain("1たい たおした");
    expect(lastFrame()).toContain("ちか1〜5かい");
  });

  it("words floors and effects", () => {
    expect(floorSpan({ from: 10, to: 10 })).toBe("ちか10かい");
    expect(floorSpan({ from: 30, to: Number.POSITIVE_INFINITY })).toBe(
      "ちか30かい〜",
    );
    expect(affixEffect("fortune")).toBe("こううん+10%");
    expect(affixEffect("crimson")).toBe("わくの いろ");
  });
});

describe("MapView", () => {
  beforeEach(() => setLocale("ja"));

  it("lays out areas, bands and bosses below the deepest floor", () => {
    const rows = mapRows(12);
    expect(rows[0]).toMatchObject({ kind: "area", area: "area.cave" });
    expect(rows[1]).toMatchObject({ kind: "band", from: 1, to: 5 });
    expect(rows[2]).toMatchObject({ kind: "band", from: 6, to: 9 });
    expect(rows[3]).toMatchObject({ kind: "boss", from: 10 });
    expect(rows[rows.length - 1]).toMatchObject({ kind: "boss", from: 30 });
  });

  it("marks where the party is and the bosses beaten", () => {
    const progress = emptyProgress();
    progress.adventure = {
      floor: 12,
      deepest: 14,
      points: 3,
      wins: 13,
      losses: 1,
    };
    progress.codex = recordSlain(progress.codex, [
      { floor: 10, monster: "boss.bugKing", boss: true, won: true },
    ]);
    const { lastFrame } = render(
      <MapView progress={progress} height={30} onClose={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("いま ちか12かい・ログの もり");
    expect(frame).toContain("さいしん ちか14かい");
    expect(frame).toContain("ボスまで あと8かい");
    expect(frame).toMatch(/キングバグスライム ✓/);
    expect(frame).toMatch(/ちか11〜15かい.*◀ いま ここ/);
    expect(frame).toContain("でる そうび ランク0〜1");
  });

  it("colors the odds", () => {
    expect(oddsColor(100, 50)).toBe("green");
    expect(oddsColor(50, 55)).toBe("yellow");
    expect(oddsColor(10, 50)).toBe("red");
  });
});

describe("EquipView extras", () => {
  beforeEach(() => setLocale("ja"));

  it("shows a unique's lore, its set and the blacksmith's price", async () => {
    const progress = emptyProgress();
    const sword = uniqueItem("heroSword", "h");
    const armor = uniqueItem("heroArmor", "a");
    progress.bag = [armor, sword];
    progress.equipped = { weapon: "h", armor: "a" };
    progress.gold = 50;
    const upgrades: string[] = [];
    const { lastFrame, stdin } = render(
      <EquipView
        progress={progress}
        onUpgrade={(id) => upgrades.push(id)}
        onClose={() => {}}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ゆうしゃのつるぎ");
    expect(frame).toContain("ユニーク");
    expect(frame).toContain("ゆうしゃの そうび 2/3");
    expect(frame).toContain("きたえる 100G（もちきん 50G）");
    expect(frame).toContain("クエストを おえるたび");
    await tick();
    stdin.write("u");
    await tick();
    expect(upgrades).toEqual(["h"]);
  });
});
