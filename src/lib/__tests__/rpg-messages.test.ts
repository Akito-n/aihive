import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { setLocale } from "../i18n.js";
import type { Award } from "../progress.js";
import { emptyProgress } from "../progress.js";
import {
  awardMessage,
  levelUpMessage,
  mailMessage,
  poisonMessage,
} from "../rpg-messages.js";

beforeEach(() => setLocale("ja"));
afterEach(() => setLocale("ja"));

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

describe("awardMessage", () => {
  const award = (overrides: Partial<Award>): Award => ({
    xp: 35,
    member: "Worker 1",
    memberLevel: { before: 2, after: 2 },
    partyLevel: { before: 3, after: 3 },
    boss: false,
    progress: emptyProgress(),
    ...overrides,
  });

  it("tells the experience gained", () => {
    expect(awardMessage(award({}), "T1").text).toBe(
      "Worker 1は 35ポイントの けいけんちを かくとく！",
    );
  });

  it("puts a party level up first, then a member's, then a boss", () => {
    expect(
      awardMessage(
        award({
          partyLevel: { before: 3, after: 4 },
          memberLevel: { before: 2, after: 3 },
        }),
        "T1",
      ).text,
    ).toBe("パーティの レベルが 4に あがった！");
    expect(
      awardMessage(
        award({ memberLevel: { before: 2, after: 3 }, boss: true }),
        "T1",
      ).text,
    ).toBe("Worker 1の レベルが 3に あがった！");
    expect(awardMessage(award({ boss: true }), "T1").text).toContain(
      "ボス T1 を たおした！",
    );
  });
});
