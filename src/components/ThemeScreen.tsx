import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { t, tf } from "../lib/i18n.js";
import { loadProgress } from "../lib/progress.js";
import { getTheme, saveTheme, THEMES } from "../lib/theme.js";
import { Window } from "./Window.js";

interface ThemeScreenProps {
  onBack: () => void;
  /** Where the choice is saved; the default is ~/.aihive/theme */
  file?: string;
  /** Themes bought in the shop; read from the adventure record by default */
  unlocked?: string[];
}

export function ThemeScreen({ onBack, file, unlocked }: ThemeScreenProps) {
  const [owned] = useState(() => unlocked ?? loadProgress().unlocked);
  const isLocked = (i: number) =>
    THEMES[i].price !== undefined && !owned.includes(THEMES[i].key);
  const [selectedIndex, setSelectedIndex] = useState(
    Math.max(
      0,
      THEMES.findIndex((th) => th.key === getTheme()),
    ),
  );

  useInput((_input, key) => {
    if (key.escape) {
      onBack();
      return;
    }
    if (key.upArrow) {
      setSelectedIndex((prev) => Math.max(0, prev - 1));
      return;
    }
    if (key.downArrow) {
      setSelectedIndex((prev) => Math.min(THEMES.length - 1, prev + 1));
      return;
    }
    if (key.return && !isLocked(selectedIndex)) {
      saveTheme(THEMES[selectedIndex].key, file);
      onBack();
    }
  });

  const current = getTheme();

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Window title={t("theme.title")} paddingX={3} paddingY={1}>
        {THEMES.map((theme, i) => {
          const isSelected = i === selectedIndex;
          return (
            <Box key={theme.key} gap={1}>
              <Text>{isSelected ? "▶" : " "}</Text>
              <Text bold={isSelected} dimColor={isLocked(i)}>
                {t(theme.labelKey)}
              </Text>
              {isLocked(i) && (
                <Text color="gray">
                  {tf("theme.locked", { price: theme.price ?? 0 })}
                </Text>
              )}
              {theme.key === current && (
                <Text color="gray"> {t("language.current")}</Text>
              )}
            </Box>
          );
        })}
      </Window>
      <Box marginTop={1} gap={2}>
        <Text dimColor>↑↓ {t("common.select")}</Text>
        <Text dimColor>Enter {t("common.confirm")}</Text>
        <Text dimColor>Esc {t("common.back")}</Text>
      </Box>
    </Box>
  );
}
