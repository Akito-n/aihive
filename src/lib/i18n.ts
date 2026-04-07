// ─── i18n ─────────────────────────────────────────────────────────
// Lightweight, type-safe internationalization without external dependencies.

import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import type { TransKey } from "../locales/en.js";
import { en } from "../locales/en.js";
import { ja } from "../locales/ja.js";

export type Locale = "en" | "ja";

export const LOCALES: { key: Locale; label: string }[] = [
  { key: "en", label: "English" },
  { key: "ja", label: "日本語" },
];

const dictionaries: Record<Locale, Record<TransKey, string>> = { en, ja };

let currentLocale: Locale = "ja";

// ─── Persistence ──────────────────────────────────────────────────

const LANG_FILE = path.join(homedir(), ".aihive", "lang");

export function loadLocale(): Locale {
  try {
    const saved = fs.readFileSync(LANG_FILE, "utf8").trim();
    if (saved === "en" || saved === "ja") {
      currentLocale = saved;
    }
  } catch {
    // default
  }
  return currentLocale;
}

export function saveLocale(locale: Locale): void {
  currentLocale = locale;
  const dir = path.dirname(LANG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(LANG_FILE, locale);
}

// ─── Translation ──────────────────────────────────────────────────

export function t(key: TransKey): string {
  return dictionaries[currentLocale][key] ?? dictionaries.en[key] ?? key;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}
