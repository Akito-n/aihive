import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  awardTask,
  battleGold,
  buyGood,
  emptyProgress,
  equipItem,
  isBoss,
  levelForXp,
  levelProgress,
  loadProgress,
  memberLevelOf,
  moveLevel,
  movesPower,
  type Progress,
  partyLevelOf,
  partyPowerOf,
  recordSkillUses,
  saveProgress,
  sellItem,
  setLooks,
  taskXp,
  upgradeItem,
  xpForLevel,
} from "../progress.js";
import type { Task } from "../tasks.js";

const NOW = Date.parse("2026-10-20T12:00:00Z");
const HOUR_AGO = new Date(NOW - 3_600_000).toISOString();

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "T1",
    description: "",
    assignedTo: "worker-1",
    state: "done",
    blockedBy: [],
    createdAt: HOUR_AGO,
    updatedAt: HOUR_AGO,
    ...overrides,
  };
}

function tempFile(): string {
  return path.join(
    fs.mkdtempSync(path.join(os.tmpdir(), "aihive-progress-")),
    "progress.json",
  );
}

const ctx = {
  all: [],
  checksPassed: false,
  stalled: false,
  todayCount: 0,
  now: NOW,
};

describe("levels", () => {
  it("follows XP(n) = k × (n − 1)²", () => {
    expect(xpForLevel(1, 50)).toBe(0);
    expect(xpForLevel(5, 50)).toBe(800);
    expect(levelForXp(0, 50)).toBe(1);
    expect(levelForXp(49, 50)).toBe(1);
    expect(levelForXp(50, 50)).toBe(2);
    expect(levelForXp(4050, 50)).toBe(10);
    expect(levelProgress(125, 50)).toBeCloseTo(0.5);
  });
});

describe("taskXp", () => {
  it("rewards tasks, subtasks and their bonuses", () => {
    expect(taskXp(task(), ctx)).toBe(25); // 20 + never stalled
    expect(taskXp(task({ id: "T1-2" }), ctx)).toBe(15);
    expect(taskXp(task(), { ...ctx, checksPassed: true, stalled: true })).toBe(
      30,
    );
  });

  it("adds the boss bonus when every subtask of a parent is done", () => {
    const parent = task();
    const all = [parent, task({ id: "T1-1" }), task({ id: "T1-2" })];
    expect(isBoss(parent, all)).toBe(true);
    expect(taskXp(parent, { ...ctx, all })).toBe(55);
    const unfinished = [parent, task({ id: "T1-1", state: "running" })];
    expect(isBoss(parent, unfinished)).toBe(false);
    expect(isBoss(parent, [parent])).toBe(false);
  });

  it("gives nothing for a task closed within a minute of its creation", () => {
    const quick = task({ createdAt: new Date(NOW - 30_000).toISOString() });
    expect(taskXp(quick, ctx)).toBe(0);
  });

  it("earns less after many tasks in a day", () => {
    expect(taskXp(task(), { ...ctx, todayCount: 20 })).toBe(13);
    expect(taskXp(task(), { ...ctx, todayCount: 50 })).toBe(6);
  });
});

describe("awardTask", () => {
  const input = (overrides = {}) => ({
    project: "/proj",
    task: task(),
    member: { name: "Worker 1", role: "worker" },
    checksPassed: true,
    stalled: false,
    all: [task()],
    now: NOW,
    ...overrides,
  });

  it("saves the party's and the member's experience and levels", () => {
    const file = tempFile();
    const first = awardTask(input(), file);
    expect(first?.xp).toBe(35);
    expect(first?.memberLevel).toEqual({ before: 1, after: 2 });
    expect(first?.partyLevel).toEqual({ before: 1, after: 1 });
    const second = awardTask(input({ task: task({ id: "T2" }) }), file);
    expect(second?.partyLevel).toEqual({ before: 1, after: 2 });

    const saved = loadProgress(file);
    expect(saved.partyXp).toBe(70);
    expect(saved.tasksDone).toBe(2);
    expect(partyLevelOf(saved)).toBe(2);
    expect(memberLevelOf(saved, "Worker 1")).toBe(2);
    expect(memberLevelOf(saved, "Reviewer")).toBe(1);
  });

  it("rewards a task once per project", () => {
    const file = tempFile();
    expect(awardTask(input(), file)).toBeDefined();
    expect(awardTask(input(), file)).toBeUndefined();
    expect(awardTask(input({ project: "/other" }), file)).toBeDefined();
    expect(loadProgress(file).tasksDone).toBe(2);
  });

  it("keeps gains another aihive saved in the meantime", () => {
    const file = tempFile();
    awardTask(input(), file);
    const other = loadProgress(file);
    other.partyXp += 100;
    saveProgress(other, file);
    awardTask(input({ task: task({ id: "T2" }) }), file);
    expect(loadProgress(file).partyXp).toBe(35 + 100 + 35);
  });

  it("counts today's tasks and starts over the next day", () => {
    const file = tempFile();
    awardTask(input(), file);
    awardTask(input({ task: task({ id: "T2" }) }), file);
    expect(loadProgress(file).today.count).toBe(2);
    awardTask(input({ task: task({ id: "T3" }), now: NOW + 86_400_000 }), file);
    expect(loadProgress(file).today.count).toBe(1);
  });

  it("grows the member's skills and explores with the points earned", () => {
    const file = tempFile();
    // 35 points: floor 1 (30) fought, 5 left
    expect(
      awardTask(input({ random: () => 0.5 }), file)?.events.map((e) => e.floor),
    ).toEqual([1]);
    const award = awardTask(
      input({ task: task({ id: "T2" }), random: () => 0.5 }),
      file,
    );
    // An hour's work: たいりょく 6, a fighter's ちから 1 → 2
    expect(award?.skills).toEqual({ str: 2, vit: 6, agi: 2, int: 3 });
    // 5 + 35 points: floor 2 (32) fought, 8 left
    expect(award?.events.map((e) => e.floor)).toEqual([2]);
    const saved = loadProgress(file);
    expect(saved.members["worker-1"].skills).toEqual({
      str: 4,
      vit: 12,
      agi: 4,
      int: 6,
    });
    expect(saved.adventure).toMatchObject({ floor: 3, points: 8, wins: 2 });
  });

  it("puts gear dropped in won battles into the bag", () => {
    const file = tempFile();
    // Rolls of 0: every battle won, every drop taken
    const award = awardTask(input({ random: () => 0 }), file);
    expect(award?.events).toHaveLength(1);
    expect(award?.drops).toHaveLength(1);
    expect(loadProgress(file).bag).toEqual(award?.drops);
    // Rolls near 1: still won with a strong party, but nothing drops
    const none = awardTask(
      input({ task: task({ id: "T2" }), random: () => 0.99 }),
      file,
    );
    expect(none?.drops).toEqual([]);
  });

  it("fills the codex with what dropped and what was beaten", () => {
    const file = tempFile();
    const award = awardTask(input({ random: () => 0.5 }), file);
    const saved = loadProgress(file);
    expect(saved.codex.monsters).toEqual({ "monster.slime": 1 });
    expect(award?.drops).toEqual([]);
    // Selling the gear later keeps it in the codex
    const found = awardTask(
      input({ task: task({ id: "T2" }), random: () => 0 }),
      file,
    );
    const item = found?.drops[0];
    expect(item).toBeDefined();
    if (!item) return;
    sellItem(item.id, file);
    expect(loadProgress(file).codex.bases).toContain(item.base);
  });

  it("pays five times the gold for a shiny monster", () => {
    const file = tempFile();
    // Rolls of 0 meet the golden slime on the first floor
    const award = awardTask(input({ random: () => 0 }), file);
    expect(award?.events[0].rare).toBe(true);
    expect(award?.gold).toBe(battleGold(1, false) * 5);
  });

  it("lets the blacksmith upgrade gear for gold", () => {
    const file = tempFile();
    const p = emptyProgress();
    p.bag = [
      {
        id: "s",
        base: "ironSword",
        rarity: "common",
        affixes: [],
        power: 5,
      },
    ];
    p.gold = 100;
    saveProgress(p, file);
    const first = upgradeItem("s", file);
    expect(first.cost).toBe(60);
    expect(first.progress.gold).toBe(40);
    expect(loadProgress(file).bag[0]).toMatchObject({ plus: 1, power: 7 });
    // Short of gold: nothing changes
    const second = upgradeItem("s", file);
    expect(second.cost).toBe(0);
    expect(loadProgress(file).bag[0].plus).toBe(1);
    expect(upgradeItem("gone", file).cost).toBe(0);
  });

  it("adds worn gear to the party's power", () => {
    const p = emptyProgress();
    const bare = partyPowerOf(p);
    p.bag = [
      { id: "s", base: "ironSword", rarity: "common", affixes: [], power: 5 },
    ];
    p.equipped = { weapon: "s" };
    expect(partyPowerOf(p)).toBe(bare + 5);
  });

  it("wins gold in battles", () => {
    const file = tempFile();
    const award = awardTask(input({ random: () => 0.5 }), file);
    expect(award?.gold).toBe(battleGold(1, false));
    expect(loadProgress(file).gold).toBe(2);
    expect(battleGold(10, true)).toBe(70);
  });

  it("earns titles along the way and keeps them", () => {
    const file = tempFile();
    // Even rolls: no shiny monster or unique to earn more titles by
    const random = () => 0.5;
    expect(awardTask(input({ random }), file)?.titles).toEqual(["firstQuest"]);
    expect(
      awardTask(input({ task: task({ id: "T2" }), random }), file)?.titles,
    ).toEqual([]);
    expect(loadProgress(file).titles).toEqual(["firstQuest"]);
  });

  it("gives no skills or points for a task closed at once", () => {
    const file = tempFile();
    const award = awardTask(
      input({ task: task({ createdAt: new Date(NOW).toISOString() }) }),
      file,
    );
    expect(award?.skills).toEqual({ str: 0, vit: 0, agi: 0, int: 0 });
    expect(loadProgress(file).adventure.points).toBe(0);
  });
});

describe("equipment", () => {
  const sword = {
    id: "s1",
    base: "ironSword",
    rarity: "rare",
    affixes: ["crimson"],
    power: 6,
  };

  it("wears an item in its slot and keeps it across loads", () => {
    const file = tempFile();
    saveProgress({ ...emptyProgress(), bag: [sword] } as Progress, file);
    expect(equipItem("s1", file).equipped).toEqual({ weapon: "s1" });
    expect(loadProgress(file).equipped).toEqual({ weapon: "s1" });
    expect(equipItem("gone", file).equipped).toEqual({ weapon: "s1" });
  });

  it("sells unworn gear for gold", () => {
    const file = tempFile();
    const ring = { ...sword, id: "r1", base: "ring", power: 2 };
    saveProgress(
      {
        ...emptyProgress(),
        bag: [sword, ring],
        equipped: { weapon: "s1" },
      } as Progress,
      file,
    );
    expect(sellItem("s1", file).gold).toBe(0);
    const sold = sellItem("r1", file);
    expect(sold.gold).toBe(10);
    expect(sold.bag.map((i) => i.id)).toEqual(["s1"]);
    expect(loadProgress(file).gold).toBe(10);
  });

  it("buys a good once, when the gold is there", () => {
    const file = tempFile();
    saveProgress({ ...emptyProgress(), gold: 600 }, file);
    expect(buyGood("ff", 500, file)).toMatchObject({ bought: true });
    expect(buyGood("ff", 500, file).bought).toBe(false);
    expect(buyGood("gameboy", 500, file).bought).toBe(false);
    expect(loadProgress(file)).toMatchObject({ gold: 100, unlocked: ["ff"] });
  });

  it("turns the look off and on", () => {
    const file = tempFile();
    expect(setLooks(false, file).looks).toBe(false);
    expect(loadProgress(file).looks).toBe(false);
    expect(setLooks(true, file).looks).toBe(true);
  });

  it("drops malformed gear and slots that don't match", () => {
    const file = tempFile();
    fs.writeFileSync(
      file,
      JSON.stringify({
        bag: [sword, { id: "bad", base: "nope" }],
        equipped: { weapon: "s1", armor: "s1", accessory: "bad" },
      }),
    );
    const p = loadProgress(file);
    expect(p.bag.map((i) => i.id)).toEqual(["s1"]);
    expect(p.equipped).toEqual({ weapon: "s1" });
    expect(p.looks).toBe(true);
  });
});

describe("special moves", () => {
  it("counts each skill use once and tells new and stronger moves", () => {
    const file = tempFile();
    const first = recordSkillUses(
      [
        { id: "u1", skill: "review" },
        { id: "u1", skill: "review" },
        { id: "u2", skill: "review" },
      ],
      file,
    );
    expect(first?.learned).toEqual(["review"]);
    expect(first?.progress.moves).toEqual({ review: 2 });
    expect(recordSkillUses([{ id: "u2", skill: "review" }], file)).toBe(
      undefined,
    );
    const second = recordSkillUses([{ id: "u3", skill: "review" }], file);
    expect(second?.learned).toEqual([]);
    expect(second?.leveledUp).toEqual([{ name: "review", level: 2 }]);
    expect(loadProgress(file).moves).toEqual({ review: 3 });
  });

  it("levels moves on a square curve and adds them to the party's power", () => {
    expect(moveLevel(0)).toBe(1);
    expect(moveLevel(3)).toBe(2);
    expect(moveLevel(12)).toBe(3);
    expect(movesPower({ a: 3, b: 0 })).toBe(3);
  });

  it("drops malformed moves on load", () => {
    const file = tempFile();
    fs.writeFileSync(
      file,
      JSON.stringify({
        moves: { ok: 2, "bad name": 3, neg: -1 },
        countedUses: ["u1", 4],
      }),
    );
    const p = loadProgress(file);
    expect(p.moves).toEqual({ ok: 2 });
    expect(p.countedUses).toEqual(["u1"]);
  });

  it("keeps only known titles, once each", () => {
    const file = tempFile();
    fs.writeFileSync(
      file,
      JSON.stringify({ titles: ["veteran", "nope", "veteran", 3] }),
    );
    expect(loadProgress(file).titles).toEqual(["veteran"]);
  });
});

describe("loadProgress", () => {
  it("starts from zero when the file is missing or broken", () => {
    expect(loadProgress(tempFile()).partyXp).toBe(0);
    const file = tempFile();
    fs.writeFileSync(file, "{not json");
    expect(loadProgress(file).partyXp).toBe(0);
  });

  it("drops malformed fields and keeps the rest", () => {
    const file = tempFile();
    fs.writeFileSync(
      file,
      JSON.stringify({
        partyXp: 120,
        tasksDone: -3,
        members: { "worker-1": { name: "Worker 1", xp: 40 }, bad: { xp: "x" } },
        counted: ["/p#T1", 5],
      }),
    );
    const p = loadProgress(file);
    expect(p.partyXp).toBe(120);
    expect(p.tasksDone).toBe(0);
    expect(Object.keys(p.members)).toEqual(["worker-1"]);
    expect(p.counted).toEqual(["/p#T1"]);
    expect(p.members["worker-1"].skills).toEqual({
      str: 0,
      vit: 0,
      agi: 0,
      int: 0,
    });
  });

  it("reads the adventure and skills, fixing what is out of range", () => {
    const file = tempFile();
    fs.writeFileSync(
      file,
      JSON.stringify({
        members: {
          "worker-1": { name: "Worker 1", xp: 1, skills: { str: 5, vit: "x" } },
        },
        adventure: { floor: 0, deepest: 7, points: 12, wins: 3, losses: -1 },
      }),
    );
    const p = loadProgress(file);
    expect(p.members["worker-1"].skills).toEqual({
      str: 5,
      vit: 0,
      agi: 0,
      int: 0,
    });
    expect(p.adventure).toEqual({
      floor: 1,
      deepest: 7,
      points: 12,
      wins: 3,
      losses: 0,
    });
  });
});
