import { describe, expect, it } from "vitest";
import { emptyProgress } from "../progress.js";
import { earnTitles, isTitleId, TITLES, titleName } from "../titles.js";

const NOON = new Date(2026, 9, 20, 12, 0);
const NIGHT = new Date(2026, 9, 20, 2, 0);

describe("earnTitles", () => {
  it("adds each title once, when the record first earns it", () => {
    const p = emptyProgress();
    expect(earnTitles(p, NOON, true)).toEqual([]);
    p.tasksDone = 1;
    p.adventure.deepest = 12;
    expect(earnTitles(p, NOON, true)).toEqual(["firstQuest", "deepDiver"]);
    expect(earnTitles(p, NOON, true)).toEqual([]);
    expect(p.titles).toEqual(["firstQuest", "deepDiver"]);
  });

  it("gives the night owl only for a task finished late at night", () => {
    const p = emptyProgress();
    expect(earnTitles(p, NIGHT, false)).toEqual([]);
    expect(earnTitles(p, NIGHT, true)).toEqual(["nightOwl"]);
  });

  it("knows every title's name", () => {
    for (const title of TITLES) expect(titleName(title.id)).toBe(title.name);
    expect(isTitleId("nope")).toBe(false);
  });
});
