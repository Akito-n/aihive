import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  conditionOf,
  frameStyle,
  getTheme,
  helpBarHeight,
  jobKeyOf,
  loadTheme,
  saveTheme,
  setTheme,
} from "../theme.js";

afterEach(() => setTheme("retro"));

describe("theme persistence", () => {
  it("defaults to the retro look", () => {
    expect(getTheme()).toBe("retro");
  });

  it("saves the choice and loads it back", () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "aihive-theme-")),
      "theme",
    );
    saveTheme("classic", file);
    expect(fs.readFileSync(file, "utf8")).toBe("classic");
    setTheme("retro");
    expect(loadTheme(file)).toBe("classic");
  });

  it("ignores an unknown or missing theme file", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-theme-"));
    const file = path.join(dir, "theme");
    fs.writeFileSync(file, "neon");
    expect(loadTheme(file)).toBe("retro");
    expect(loadTheme(path.join(dir, "missing"))).toBe("retro");
  });
});

describe("theme tokens", () => {
  it("draws white rounded windows in retro and keeps classic colors", () => {
    expect(frameStyle()).toEqual({
      borderStyle: "round",
      borderColor: "white",
    });
    setTheme("classic");
    expect(frameStyle(true)).toEqual({
      borderStyle: "double",
      borderColor: "cyan",
    });
  });

  it("gives the retro help bar room for its frame", () => {
    expect(helpBarHeight()).toBe(3);
    setTheme("classic");
    expect(helpBarHeight()).toBe(1);
  });
});

describe("RPG vocabulary", () => {
  it("maps known roles to jobs and leaves custom roles alone", () => {
    expect(jobKeyOf("worker")).toBe("job.worker");
    expect(jobKeyOf("reviewer")).toBe("job.reviewer");
    expect(jobKeyOf("designer")).toBeUndefined();
  });

  it("shows a stalled task as poison, over the agent's status", () => {
    expect(conditionOf("running", false)).toEqual({
      key: "condition.running",
      color: "yellow",
    });
    expect(conditionOf("running", true)).toEqual({
      key: "condition.stalled",
      color: "magenta",
    });
    expect(conditionOf("error", false).key).toBe("condition.error");
  });
});
