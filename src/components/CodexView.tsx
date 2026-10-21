import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { isRareMonster, monsterHome } from "../lib/adventure.js";
import {
  CODEX_PAGES,
  type CodexPage,
  codexCount,
  codexEntries,
  hasEntry,
} from "../lib/codex.js";
import {
  AFFIXES,
  BASES,
  RARITY_COLORS,
  SETS,
  SLOT_LABEL_KEYS,
  UNIQUES,
} from "../lib/gear.js";
import { t, tf } from "../lib/i18n.js";
import type { Progress } from "../lib/progress.js";
import { cursorGlyph } from "../lib/theme.js";
import type { TransKey } from "../locales/en.js";
import { Window } from "./Window.js";

interface CodexViewProps {
  progress: Progress;
  /** Rows the list may take */
  height?: number;
  onClose?: () => void;
}

const PAGE_LABEL_KEYS: Record<CodexPage, TransKey> = {
  bases: "codex.page.bases",
  affixes: "codex.page.affixes",
  uniques: "codex.page.uniques",
  monsters: "codex.page.monsters",
};

const UNKNOWN = "？？？？";

/** Floors as words: "B3–B7", "B10" or "B30–" */
export function floorSpan(span: { from: number; to: number }): string {
  if (span.from === span.to) return tf("codex.floor", { floor: span.from });
  if (!Number.isFinite(span.to)) {
    return tf("codex.floorsFrom", { floor: span.from });
  }
  return tf("codex.floors", { from: span.from, to: span.to });
}

/** What an affix does, as words */
export function affixEffect(key: string): string {
  const affix = AFFIXES[key];
  const parts: string[] = [];
  if (affix.power) parts.push(tf("codex.effect.power", { power: affix.power }));
  if (affix.luck) {
    parts.push(tf("codex.effect.luck", { luck: Math.round(affix.luck * 100) }));
  }
  for (const kind of Object.keys(affix.look ?? {})) {
    parts.push(t(`equip.look.${kind}` as TransKey));
  }
  return parts.join("・");
}

interface Row {
  key: string;
  known: boolean;
  /** Short label before the name, such as the slot */
  tag: string;
  name: string;
  color?: string;
  /** Shown at the right of the row */
  note: string;
  /** Shown under the list for the selected row */
  detail: string;
}

function rowsOf(page: CodexPage, progress: Progress): Row[] {
  const { codex } = progress;
  return codexEntries(page).map((key) => {
    const known = hasEntry(codex, page, key);
    switch (page) {
      case "bases": {
        const base = BASES[key];
        return {
          key,
          known,
          tag: t(SLOT_LABEL_KEYS[base.slot]),
          name: known ? t(base.name) : UNKNOWN,
          note: tf("codex.tier", { tier: base.tier }),
          detail: known
            ? tf("codex.baseDetail", { power: base.power })
            : tf("codex.hintTier", { floor: base.tier * 8 || 1 }),
        };
      }
      case "affixes": {
        const affix = AFFIXES[key];
        return {
          key,
          known,
          tag: t(affix.look ? "codex.kind.look" : "codex.kind.stat"),
          name: known ? t(affix.name) : UNKNOWN,
          color: affix.look ? "cyan" : undefined,
          note: known ? affixEffect(key) : "",
          detail: known
            ? affixEffect(key)
            : affix.minFloor
              ? tf("codex.hintFloor", { floor: affix.minFloor })
              : t("codex.hintAny"),
        };
      }
      case "uniques": {
        const u = UNIQUES[key];
        return {
          key,
          known,
          tag: t(SLOT_LABEL_KEYS[BASES[u.base].slot]),
          name: known ? t(u.name) : UNKNOWN,
          color: known ? RARITY_COLORS.unique : undefined,
          note: u.set && known ? t(SETS[u.set].name) : "",
          detail: known
            ? t(u.flavor)
            : tf("codex.hintFloor", { floor: u.minFloor }),
        };
      }
      default: {
        const home = monsterHome(key);
        const count = codex.monsters[key] ?? 0;
        const boss = key.startsWith("boss.");
        const rare = isRareMonster(key);
        return {
          key,
          known,
          tag: t(
            boss
              ? "codex.kind.boss"
              : rare
                ? "codex.kind.rare"
                : "codex.kind.monster",
          ),
          name: known ? t(key as TransKey) : UNKNOWN,
          color: boss ? "yellow" : rare ? "yellowBright" : undefined,
          note: known ? tf("codex.slain", { count }) : "",
          detail: home ? floorSpan(home) : "",
        };
      }
    }
  });
}

/** The codex: everything ever found, with the rest left as ？？？？ */
export function CodexView({ progress, height = 12, onClose }: CodexViewProps) {
  const [pageIndex, setPageIndex] = useState(0);
  const [selected, setSelected] = useState(0);
  const page = CODEX_PAGES[pageIndex];
  const rows = rowsOf(page, progress);
  const index = Math.min(selected, Math.max(0, rows.length - 1));

  const turn = (step: number) => {
    setPageIndex((i) => (i + step + CODEX_PAGES.length) % CODEX_PAGES.length);
    setSelected(0);
  };

  useInput(
    (input, key) => {
      if (key.escape || input === "q" || input === "Z") onClose?.();
      else if (key.rightArrow || input === "l" || key.tab) turn(1);
      else if (key.leftArrow || input === "h") turn(-1);
      else if (key.upArrow || input === "k")
        setSelected(Math.max(0, index - 1));
      else if (key.downArrow || input === "j")
        setSelected(Math.min(rows.length - 1, index + 1));
    },
    { isActive: Boolean(onClose) },
  );

  const visible = Math.max(3, height);
  const start = Math.max(
    0,
    Math.min(index - Math.floor(visible / 2), rows.length - visible),
  );
  const all = codexCount(progress.codex);
  const current = rows[index];

  return (
    <Box flexDirection="column" gap={1}>
      <Window
        title={tf("codex.title", {
          found: all.found,
          total: all.total,
          rate: Math.floor((100 * all.found) / Math.max(1, all.total)),
        })}
      >
        <Box columnGap={2} flexWrap="wrap">
          {CODEX_PAGES.map((p, i) => {
            const count = codexCount(progress.codex, p);
            return (
              <Text key={p} bold={i === pageIndex} dimColor={i !== pageIndex}>
                {i === pageIndex ? "[" : " "}
                {t(PAGE_LABEL_KEYS[p])} {count.found}/{count.total}
                {i === pageIndex ? "]" : " "}
              </Text>
            );
          })}
        </Box>
        {rows.slice(start, start + visible).map((row, i) => {
          const isSelected = start + i === index;
          return (
            <Box key={row.key} gap={1}>
              <Text>{isSelected ? cursorGlyph() : " "}</Text>
              <Box width={12} flexShrink={0}>
                <Text dimColor>{row.tag}</Text>
              </Box>
              <Box width={26} flexShrink={0}>
                <Text
                  bold={isSelected}
                  color={row.known ? row.color : "gray"}
                  wrap="truncate-end"
                >
                  {row.name}
                </Text>
              </Box>
              <Text dimColor wrap="truncate-end">
                {row.note}
              </Text>
            </Box>
          );
        })}
      </Window>
      {current && (
        <Text color={current.known ? undefined : "gray"} wrap="truncate-end">
          ＊「{current.detail}
        </Text>
      )}
      {onClose && <Text dimColor>{t("codex.help")}</Text>}
    </Box>
  );
}
