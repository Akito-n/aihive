import { Box, Text, useInput } from "ink";
import { useState } from "react";
import { getLocale, LOCALES, saveLocale, t } from "../lib/i18n.js";

interface LanguageScreenProps {
  onBack: () => void;
}

export function LanguageScreen({ onBack }: LanguageScreenProps) {
  const [selectedIndex, setSelectedIndex] = useState(
    LOCALES.findIndex((l) => l.key === getLocale()),
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
      setSelectedIndex((prev) => Math.min(LOCALES.length - 1, prev + 1));
      return;
    }
    if (key.return) {
      const selected = LOCALES[selectedIndex];
      saveLocale(selected.key);
      onBack();
    }
  });

  const currentLocale = getLocale();

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="green"
        paddingX={3}
        paddingY={1}
      >
        <Text bold color="green">
          {t("language.title")}
        </Text>
        <Box marginTop={1} flexDirection="column">
          {LOCALES.map((locale, i) => {
            const isSelected = i === selectedIndex;
            const isCurrent = locale.key === currentLocale;
            return (
              <Box key={locale.key} gap={1}>
                <Text color="green">{isSelected ? "▶" : " "}</Text>
                <Text bold={isSelected} color={isSelected ? "green" : "white"}>
                  {locale.label}
                </Text>
                {isCurrent && (
                  <Text color="gray"> {t("language.current")}</Text>
                )}
              </Box>
            );
          })}
        </Box>
        <Box marginTop={1} gap={1}>
          <Text backgroundColor="green" color="black" bold>
            {" "}
            Enter{" "}
          </Text>
          <Text> {t("common.confirm")} </Text>
          <Text backgroundColor="gray" color="black" bold>
            {" "}
            Esc{" "}
          </Text>
          <Text> {t("common.back")} </Text>
        </Box>
      </Box>
    </Box>
  );
}
