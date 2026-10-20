import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../i18n.js";
import {
  levelOf,
  levelUpMessage,
  mailMessage,
  poisonMessage,
} from "../rpg-messages.js";
import type { Task } from "../tasks.js";

beforeEach(() => setLocale("ja"));
afterEach(() => setLocale("ja"));

function task(overrides: Partial<Task>): Task {
  const now = new Date().toISOString();
  return {
    id: "T1",
    description: "",
    assignedTo: "worker-1",
    state: "done",
    blockedBy: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe("levelOf", () => {
  it("starts at 1 and counts the agent's finished tasks by name or slug", () => {
    const tasks = [
      task({ id: "T1" }),
      task({ id: "T2", assignedTo: "Worker 1" }),
      task({ id: "T3", state: "running" }),
      task({ id: "T4", assignedTo: "worker-2" }),
    ];
    expect(levelOf("Worker 1", tasks)).toBe(3);
    expect(levelOf("Reviewer", tasks)).toBe(1);
  });
});

describe("mailMessage", () => {
  it("tells who received which quest", () => {
    expect(mailMessage("task", "Coordinator", "Worker 1", "T1-2")?.text).toBe(
      "Worker 1は クエスト T1-2 を うけとった！",
    );
    expect(
      mailMessage("task", "Coordinator", "Worker 1", undefined)?.text,
    ).toBe("Worker 1は Coordinatorから めいれいを うけた。");
  });

  it("colors reports and confusion, and stays quiet for other kinds", () => {
    expect(mailMessage("result", "Worker 1", "Coordinator", "T1")).toEqual({
      text: "Worker 1は けっかを ほうこくした。",
      color: "cyan",
    });
    expect(mailMessage("error", "Worker 1", "Coordinator", "T1")?.color).toBe(
      "red",
    );
    expect(mailMessage("memory-write", "Worker 1", "x", undefined)).toBe(
      undefined,
    );
  });

  it("speaks English too", () => {
    setLocale("en");
    expect(levelUpMessage("Worker 1", 3).text).toBe(
      "Worker 1 reached level 3!",
    );
  });
});

describe("level up and poison", () => {
  it("announces a level up in yellow and poison in magenta", () => {
    expect(levelUpMessage("Worker 1", 2)).toEqual({
      text: "Worker 1の レベルが 2に あがった！",
      color: "yellow",
    });
    expect(poisonMessage("Worker 2", "T2")).toEqual({
      text: "Worker 2は どくに おかされた！（T2 が とまっている）",
      color: "magenta",
    });
  });
});
