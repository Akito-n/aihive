import { Box, Text, useInput } from "ink";
import { useState } from "react";
import {
  AFFIXES,
  BAG_LIMIT,
  equippedItems,
  type Item,
  itemName,
  type Look,
  MAX_PLUS,
  RARITY_COLORS,
  RARITY_LABEL_KEYS,
  SETS,
  SLOT_LABEL_KEYS,
  SLOTS,
  setCounts,
  setOf,
  setPieces,
  slotOf,
  UNIQUES,
  upgradeCost,
} from "../lib/gear.js";
import { t, tf } from "../lib/i18n.js";
import type { Progress } from "../lib/progress.js";
import { cursorGlyph } from "../lib/theme.js";
import { Window } from "./Window.js";

interface EquipViewProps {
  progress: Progress;
  /** Rows the bag list may take */
  height?: number;
  onEquip?: (itemId: string) => void;
  onToggleLooks?: () => void;
  onSell?: (itemId: string) => void;
  /** Pay the blacksmith to make an item stronger */
  onUpgrade?: (itemId: string) => void;
  onClose?: () => void;
}

const LOOK_KEYS = {
  frame: "equip.look.frame",
  cursor: "equip.look.cursor",
  gauge: "equip.look.gauge",
  logo: "equip.look.logo",
} as const;

/** What an item changes in the look, as words */
export function lookSummary(item: Item): string {
  const kinds = new Set<keyof Look>();
  for (const affix of item.affixes) {
    for (const kind of Object.keys(AFFIXES[affix].look ?? {})) {
      kinds.add(kind as keyof Look);
    }
  }
  return [...kinds].map((k) => t(LOOK_KEYS[k])).join("・");
}

/** The equipment screen: the party's three slots and the bag */
export function EquipView({
  progress,
  height = 12,
  onEquip,
  onToggleLooks,
  onSell,
  onUpgrade,
  onClose,
}: EquipViewProps) {
  const [selected, setSelected] = useState(0);
  // Newest finds first
  const bag = [...progress.bag].reverse();
  const worn = new Set(Object.values(progress.equipped));
  const index = Math.min(selected, Math.max(0, bag.length - 1));

  useInput(
    (input, key) => {
      if (key.escape || input === "q" || input === "E") onClose?.();
      else if (key.upArrow || input === "k")
        setSelected(Math.max(0, index - 1));
      else if (key.downArrow || input === "j")
        setSelected(Math.min(bag.length - 1, index + 1));
      else if (key.return && bag[index]) onEquip?.(bag[index].id);
      else if (input === "v") onToggleLooks?.();
      else if (input === "s" && bag[index] && !worn.has(bag[index].id))
        onSell?.(bag[index].id);
      else if (input === "u" && bag[index]) onUpgrade?.(bag[index].id);
    },
    { isActive: Boolean(onClose) },
  );

  const rows = Math.max(3, height);
  const start = Math.max(
    0,
    Math.min(index - Math.floor(rows / 2), bag.length - rows),
  );
  const current = bag[index];
  const wornItems = equippedItems(progress.bag, progress.equipped);
  const wornSets = setCounts(wornItems);
  const currentSet = current ? setOf(current) : undefined;

  return (
    <Box flexDirection="column" gap={1}>
      <Window title={t("equip.title")}>
        {SLOTS.map((slot) => {
          const item = wornItems.find((i) => slotOf(i) === slot);
          return (
            <Box key={slot} gap={1}>
              <Box width={14} flexShrink={0}>
                <Text dimColor>{t(SLOT_LABEL_KEYS[slot])}</Text>
              </Box>
              {item ? (
                <Text color={RARITY_COLORS[item.rarity]}>
                  {itemName(item)} <Text dimColor>+{item.power}</Text>
                </Text>
              ) : (
                <Text dimColor>{t("equip.none")}</Text>
              )}
            </Box>
          );
        })}
      </Window>

      <Window title={tf("equip.bag", { count: bag.length, limit: BAG_LIMIT })}>
        {bag.length === 0 ? (
          <Text dimColor>{t("equip.bagEmpty")}</Text>
        ) : (
          bag.slice(start, start + rows).map((item, i) => {
            const isSelected = start + i === index;
            return (
              <Box key={item.id} gap={1}>
                <Text>{isSelected ? cursorGlyph() : " "}</Text>
                <Text>{worn.has(item.id) ? "E" : " "}</Text>
                <Box width={14} flexShrink={0}>
                  <Text dimColor>{t(SLOT_LABEL_KEYS[slotOf(item)])}</Text>
                </Box>
                <Text
                  bold={isSelected}
                  color={RARITY_COLORS[item.rarity]}
                  wrap="truncate-end"
                >
                  {itemName(item)}
                </Text>
                <Text dimColor>+{item.power}</Text>
              </Box>
            );
          })
        )}
      </Window>

      {current && (
        <Box flexDirection="column">
          <Box columnGap={2} flexWrap="wrap">
            <Text color={RARITY_COLORS[current.rarity]}>
              {t(RARITY_LABEL_KEYS[current.rarity])}
            </Text>
            <Text>{tf("equip.power", { power: current.power })}</Text>
            {lookSummary(current) && (
              <Text color="cyan">
                {tf("equip.look", { look: lookSummary(current) })}
              </Text>
            )}
            {currentSet && (
              <Text color="green">
                {tf("equip.set", {
                  set: t(SETS[currentSet].name),
                  count: wornSets[currentSet] ?? 0,
                  total: setPieces(currentSet).length,
                })}
              </Text>
            )}
            <Text color="yellow">
              {(current.plus ?? 0) >= MAX_PLUS
                ? t("equip.maxPlus")
                : tf("equip.upgrade", {
                    cost: upgradeCost(current),
                    gold: progress.gold,
                  })}
            </Text>
          </Box>
          {current.unique && (
            <Text dimColor wrap="truncate-end">
              ＊「{t(UNIQUES[current.unique].flavor)}
            </Text>
          )}
        </Box>
      )}
      {onClose && (
        <Text dimColor>
          {tf("equip.help", {
            state: t(progress.looks ? "equip.looksOn" : "equip.looksOff"),
          })}
        </Text>
      )}
    </Box>
  );
}
