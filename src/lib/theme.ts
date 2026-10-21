// ─── Theme ────────────────────────────────────────────────────────
// Screen look: "retro" draws RPG-style windows (white frames, titles on the
// border, job names), "classic" keeps the original look.

import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { TransKey } from "../locales/en.js";
import type { Look } from "./gear.js";
import type { AgentInfo } from "./tmux.js";

export type ThemeName = "retro" | "ff" | "gameboy" | "classic";

/** Themes with a price are bought with gold in the shop first */
export const THEMES: { key: ThemeName; labelKey: TransKey; price?: number }[] =
  [
    { key: "retro", labelKey: "theme.retro" },
    { key: "ff", labelKey: "theme.ff", price: 500 },
    { key: "gameboy", labelKey: "theme.gameboy", price: 500 },
    { key: "classic", labelKey: "theme.classic" },
  ];

/** The RPG themes' colors: everything but classic draws RPG windows */
const PALETTES: Partial<
  Record<
    ThemeName,
    {
      border: "round" | "double";
      frame: string;
      accent: string;
      logo?: string[];
    }
  >
> = {
  retro: { border: "round", frame: "white", accent: "white" },
  ff: {
    border: "double",
    frame: "blueBright",
    accent: "white",
    logo: [
      "whiteBright",
      "whiteBright",
      "cyanBright",
      "cyanBright",
      "cyan",
      "blue",
      "blue",
    ],
  },
  gameboy: {
    border: "round",
    frame: "green",
    accent: "greenBright",
    logo: [
      "greenBright",
      "greenBright",
      "green",
      "green",
      "green",
      "gray",
      "gray",
    ],
  },
};

let currentTheme: ThemeName = "retro";

// ─── Persistence ──────────────────────────────────────────────────

const THEME_FILE = path.join(homedir(), ".aihive", "theme");

function isThemeName(value: string): value is ThemeName {
  return THEMES.some((th) => th.key === value);
}

export function loadTheme(file = THEME_FILE): ThemeName {
  try {
    const saved = fs.readFileSync(file, "utf8").trim();
    if (isThemeName(saved)) currentTheme = saved;
  } catch {
    // default
  }
  return currentTheme;
}

export function saveTheme(theme: ThemeName, file = THEME_FILE): void {
  currentTheme = theme;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, theme);
}

export function getTheme(): ThemeName {
  return currentTheme;
}

export function setTheme(theme: ThemeName): void {
  currentTheme = theme;
}

export function isRetro(): boolean {
  return currentTheme !== "classic";
}

// ─── Look from gear ───────────────────────────────────────────────

let currentLook: Look = {};

/** Set what the worn gear changes in the look */
export function setLook(look: Look): void {
  currentLook = look;
}

export function getLook(): Look {
  return currentLook;
}

/** The selection cursor; gear can change it in the retro theme */
export function cursorGlyph(): string {
  return (isRetro() && currentLook.cursor) || "▶";
}

/** The filled part of a gauge */
export function gaugeFill(): string {
  return currentLook.gauge ?? "█";
}

/** Row colors for the pixel logo, when gear changes them */
export function logoColors(): string[] | undefined {
  return currentLook.logo ?? PALETTES[currentTheme]?.logo;
}

// ─── Tokens ───────────────────────────────────────────────────────

/** Window frame for the current theme */
export function frameStyle(active = false): {
  borderStyle: "round" | "double" | "single";
  borderColor: string;
} {
  const palette = PALETTES[currentTheme];
  if (palette) {
    return {
      borderStyle: palette.border,
      borderColor: currentLook.frame ?? palette.frame,
    };
  }
  return active
    ? { borderStyle: "double", borderColor: "cyan" }
    : { borderStyle: "round", borderColor: "gray" };
}

/** Accent for titles and selections */
export function accentColor(): string {
  return PALETTES[currentTheme]?.accent ?? "cyan";
}

/** Rows the help bar takes: the retro one is a framed message and command window */
export function helpBarHeight(): number {
  return isRetro() ? 4 : 1;
}

// ─── RPG vocabulary ───────────────────────────────────────────────

const JOB_KEYS: Record<string, TransKey> = {
  orchestrator: "job.orchestrator",
  coordinator: "job.coordinator",
  worker: "job.worker",
  reviewer: "job.reviewer",
  scout: "job.scout",
};

/** Job name key for a role; custom roles have none and show the role itself */
export function jobKeyOf(role: string): TransKey | undefined {
  return JOB_KEYS[role];
}

export type Condition = AgentInfo["status"] | "stalled";

const CONDITION_KEYS: Record<Condition, TransKey> = {
  pending: "condition.pending",
  running: "condition.running",
  done: "condition.done",
  error: "condition.error",
  stalled: "condition.stalled",
};

const CONDITION_COLORS: Record<Condition, string> = {
  pending: "gray",
  running: "yellow",
  done: "green",
  error: "red",
  stalled: "magenta",
};

/** An agent's condition: a stalled task (poison) wins over its status */
export function conditionOf(
  status: AgentInfo["status"],
  stalled: boolean,
): { key: TransKey; color: string } {
  const condition: Condition = stalled ? "stalled" : status;
  return {
    key: CONDITION_KEYS[condition],
    color: CONDITION_COLORS[condition],
  };
}
