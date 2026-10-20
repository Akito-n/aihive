import { describe, expect, it } from "vitest";
import {
  emptyAdventure,
  emptySkills,
  enemyPower,
  explore,
  floorCost,
  isBossFloor,
  monsterOf,
  partyPower,
  skillGains,
  skillLevel,
} from "../adventure.js";
import type { Task } from "../tasks.js";

const NOW = Date.parse("2026-10-20T12:00:00Z");

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "T1",
    description: "",
    assignedTo: "worker-1",
    state: "done",
    blockedBy: [],
    createdAt: new Date(NOW - 30 * 60_000).toISOString(),
    updatedAt: new Date(NOW).toISOString(),
    ...overrides,
  };
}

const ctx = {
  all: [] as Task[],
  checksPassed: false,
  stalled: true,
  role: "custom",
  rate: 1,
  now: NOW,
};

describe("skillGains", () => {
  it("grows たいりょく with time spent, up to two hours", () => {
    expect(skillGains(task(), ctx).vit).toBe(3);
    const long = task({
      createdAt: new Date(NOW - 10 * 3_600_000).toISOString(),
    });
    expect(skillGains(long, ctx).vit).toBe(12);
  });

  it("grows ちから with a parent task's subtasks", () => {
    expect(skillGains(task(), ctx).str).toBe(1);
    const all = [task(), task({ id: "T1-1" }), task({ id: "T1-2" })];
    expect(skillGains(task(), { ...ctx, all }).str).toBe(6);
  });

  it("grows すばやさ per task and かしこさ with clean work", () => {
    expect(skillGains(task(), ctx)).toMatchObject({ agi: 2, int: 0 });
    expect(
      skillGains(task(), { ...ctx, checksPassed: true, stalled: false }).int,
    ).toBe(3);
  });

  it("grows the job's own skill faster and slows down with the daily rate", () => {
    expect(skillGains(task(), { ...ctx, role: "scout" }).agi).toBe(3);
    expect(skillGains(task(), { ...ctx, rate: 0.5 }).vit).toBe(2);
  });

  it("levels skills on a square curve", () => {
    expect(skillLevel(0)).toBe(1);
    expect(skillLevel(4)).toBe(2);
    expect(skillLevel(16)).toBe(3);
  });
});

describe("dungeon", () => {
  it("puts a boss on every tenth floor", () => {
    expect(isBossFloor(10)).toBe(true);
    expect(isBossFloor(9)).toBe(false);
    expect(enemyPower(10)).toBeGreaterThan(enemyPower(11));
    expect(monsterOf(1)).toBe("monster.slime");
    expect(monsterOf(10)).toBe("boss.bugKing");
    expect(monsterOf(999)).toBe("monster.dragon");
  });

  it("adds every member's skills and the party level to the power", () => {
    expect(partyPower([], 1)).toBe(12);
    expect(partyPower([emptySkills(), emptySkills()], 1)).toBe(22);
  });

  it("spends points on floors, going down on a win", () => {
    const start = { ...emptyAdventure(), points: floorCost(1) + floorCost(2) };
    const { adventure, events } = explore(start, 100, () => 0.5);
    expect(events.map((e) => e.won)).toEqual([true, true]);
    expect(adventure).toMatchObject({
      floor: 3,
      deepest: 3,
      points: 0,
      wins: 2,
    });
  });

  it("goes back a floor on a loss and keeps the deepest record", () => {
    const start = { ...emptyAdventure(), floor: 5, deepest: 5, points: 40 };
    const { adventure, events } = explore(start, 1, () => 0.5);
    expect(events).toEqual([
      { floor: 5, monster: "monster.slime", boss: false, won: false },
    ]);
    expect(adventure).toMatchObject({ floor: 4, deepest: 5, losses: 1 });
  });

  it("waits with leftover points and caps battles per call", () => {
    expect(explore({ ...emptyAdventure(), points: 10 }, 100).events).toEqual(
      [],
    );
    const many = explore(
      { ...emptyAdventure(), points: 100_000 },
      1e9,
      () => 0,
    );
    expect(many.events).toHaveLength(10);
    expect(many.adventure.points).toBeGreaterThan(0);
  });
});
