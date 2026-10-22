import { Box, Text, useInput } from "ink";
import { t, tf } from "../lib/i18n.js";

interface TrustScreenProps {
  /** Folders Claude Code would ask about, one window each */
  dirs: string[];
  /** true: record them as trusted; false: start and let Claude ask */
  onAnswer: (trust: boolean) => void;
}

/** How many folders are listed before the rest are counted */
const MAX_LISTED = 8;

/** Ask once, before the agents start, whether to trust all their folders */
export function TrustScreen({ dirs, onAnswer }: TrustScreenProps) {
  useInput((input, key) => {
    if (input === "y" || input === "Y") onAnswer(true);
    else if (input === "n" || input === "N" || key.escape) onAnswer(false);
  });

  const listed = dirs.slice(0, MAX_LISTED);
  const rest = dirs.length - listed.length;

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor="yellow"
      paddingX={2}
      paddingY={1}
    >
      <Text color="yellow" bold>
        {t("trust.title")}
      </Text>
      <Box marginTop={1} flexDirection="column">
        <Text>{tf("trust.body", { count: dirs.length })}</Text>
        <Text dimColor>{t("trust.warning")}</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        {listed.map((dir) => (
          <Text key={dir} wrap="truncate-middle">
            ・{dir}
          </Text>
        ))}
        {rest > 0 && <Text dimColor>{tf("trust.more", { count: rest })}</Text>}
      </Box>
      <Box marginTop={1} gap={3}>
        <Text>
          <Text color="green" bold>
            [y]
          </Text>{" "}
          {t("trust.yes")}
        </Text>
        <Text>
          <Text color="red" bold>
            [n]
          </Text>{" "}
          {t("trust.no")}
        </Text>
      </Box>
    </Box>
  );
}
