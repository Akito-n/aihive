import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  awardTask,
  isBoss,
  levelForXp,
  levelProgress,
  loadProgress,
  memberLevelOf,
  partyLevelOf,
  saveProgress,
  taskXp,
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
  });
});
