import { describe, expect, it } from "vitest";
import { bossHp, questMonsterOf } from "../monsters.js";
import type { Task } from "../tasks.js";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "T1",
    description: "",
    assignedTo: "worker-1",
    state: "pending",
    blockedBy: [],
    createdAt: "2026-10-20T00:00:00Z",
    updatedAt: "2026-10-20T00:00:00Z",
    ...overrides,
  };
}

describe("questMonsterOf", () => {
  it("picks a monster from the task's description", () => {
    expect(questMonsterOf(task({ description: "Fix the login bug" }))).toBe(
      "quest.slime",
    );
    expect(questMonsterOf(task({ description: "テストを追加する" }))).toBe(
      "quest.golem",
    );
    expect(questMonsterOf(task({ description: "Review PR #3" }))).toBe(
      "quest.mimic",
    );
    expect(questMonsterOf(task({ description: "画面の色を変える" }))).toBe(
      "quest.imp",
    );
    expect(questMonsterOf(task({ description: "build a guide" }))).toBe(
      "quest.stray",
    );
  });
});

describe("bossHp", () => {
  it("counts a parent's open subtasks", () => {
    const all = [
      task(),
      task({ id: "T1-1", state: "done" }),
      task({ id: "T1-2" }),
      task({ id: "T2" }),
    ];
    expect(bossHp(all[0], all)).toEqual({ left: 1, total: 2 });
    expect(bossHp(all[1], all)).toBeUndefined();
    expect(bossHp(all[3], all)).toBeUndefined();
  });
});
