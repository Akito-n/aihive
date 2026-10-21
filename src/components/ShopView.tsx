import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { t, tf } from "../lib/i18n.js";
import type { Progress } from "../lib/progress.js";
import { cursorGlyph, THEMES } from "../lib/theme.js";
import { Window } from "./Window.js";

/** Goods for sale: the themes that have a price */
export const SHOP_GOODS = THEMES.filter((th) => th.price !== undefined);

interface ShopViewProps {
  progress: Progress;
  /** Buy a good; true when it was bought */
  onBuy?: (key: string, price: number) => boolean;
  onClose?: () => void;
}

/** The shop: spend gold on themes */
export function ShopView({ progress, onBuy, onClose }: ShopViewProps) {
  const [selected, setSelected] = useState(0);
  const [notice, setNotice] = useState<{ text: string; color: string }>();

  useInput(
    (input, key) => {
      if (key.escape || input === "q" || input === "G") onClose?.();
      else if (key.upArrow || input === "k")
        setSelected((i) => Math.max(0, i - 1));
      else if (key.downArrow || input === "j")
        setSelected((i) => Math.min(SHOP_GOODS.length - 1, i + 1));
      else if (key.return) {
        const good = SHOP_GOODS[selected];
        if (!good || good.price === undefined || !onBuy) return;
        if (progress.unlocked.includes(good.key)) return;
        setNotice(
          onBuy(good.key, good.price)
            ? {
                text: tf("shop.bought", { item: t(good.labelKey) }),
                color: "yellow",
              }
            : { text: t("shop.short"), color: "red" },
        );
      }
    },
    { isActive: Boolean(onClose) },
  );

  return (
    <Box flexDirection="column" gap={1}>
      <Window title={t("shop.title")}>
        <Text color="yellow">{tf("shop.gold", { gold: progress.gold })}</Text>
        {SHOP_GOODS.map((good, i) => {
          const owned = progress.unlocked.includes(good.key);
          const price = good.price ?? 0;
          return (
            <Box key={good.key} gap={1}>
              <Text>{i === selected ? cursorGlyph() : " "}</Text>
              <Box width={34} flexShrink={0}>
                <Text bold={i === selected} dimColor={owned}>
                  {t(good.labelKey)}
                </Text>
              </Box>
              {owned ? (
                <Text dimColor>{t("shop.owned")}</Text>
              ) : (
                <Text color={progress.gold >= price ? "yellow" : "gray"}>
                  {tf("shop.price", { price })}
                </Text>
              )}
            </Box>
          );
        })}
      </Window>
      {notice ? (
        <Text color={notice.color}>＊「{notice.text}</Text>
      ) : (
        <Text dimColor>{t("shop.hint")}</Text>
      )}
      {onClose && <Text dimColor>{t("shop.help")}</Text>}
    </Box>
  );
}
