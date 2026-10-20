import { Box, Text, useInput } from "ink";
import { t, tf } from "../lib/i18n.js";
import { toSlug } from "../lib/mailbox.js";
import {
  levelForXp,
  levelProgress,
  MEMBER_XP_FACTOR,
  PARTY_XP_FACTOR,
  type Progress,
  xpForLevel,
} from "../lib/progress.js";
import { jobKeyOf } from "../lib/theme.js";
import { Window } from "./Window.js";

interface StatusViewProps {
  progress: Progress;
  /** The party as configured now, in order */
  members: { name: string; role: string }[];
  onClose?: () => void;
}

/** A gauge of filled and empty blocks */
export function gauge(share: number, width: number): string {
  const filled = Math.max(0, Math.min(width, Math.round(share * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

/** XP still needed for the next level */
export function xpToNext(xp: number, factor: number): number {
  return xpForLevel(levelForXp(xp, factor) + 1, factor) - xp;
}

/** The adventure record: the party's level and each member's */
export function StatusView({ progress, members, onClose }: StatusViewProps) {
  useInput(
    (input, key) => {
      if (key.escape || input === "q" || input === "S") onClose?.();
    },
    { isActive: Boolean(onClose) },
  );

  const partyLevel = levelForXp(progress.partyXp, PARTY_XP_FACTOR);
  return (
    <Box flexDirection="column" gap={1}>
      <Window title={t("status.title")}>
        <Box gap={2}>
          <Text bold>
            {t("status.party")} Lv{partyLevel}
          </Text>
          <Text color="yellow">
            {gauge(levelProgress(progress.partyXp, PARTY_XP_FACTOR), 20)}
          </Text>
          <Text dimColor>
            {tf("status.nextLevel", {
              xp: xpToNext(progress.partyXp, PARTY_XP_FACTOR),
            })}
          </Text>
        </Box>
        <Box gap={3}>
          <Text>{tf("status.tasksDone", { count: progress.tasksDone })}</Text>
          <Text>{tf("status.bosses", { count: progress.bossesDefeated })}</Text>
        </Box>
      </Window>

      <Window title={t("retro.party")}>
        {members.map((m) => {
          const record = progress.members[toSlug(m.name)];
          const xp = record?.xp ?? 0;
          const jobKey = jobKeyOf(m.role);
          return (
            <Box key={m.name} gap={1}>
              <Box width={16}>
                <Text wrap="truncate-end">{m.name}</Text>
              </Box>
              <Box width={10}>
                <Text dimColor>{jobKey ? t(jobKey) : m.role}</Text>
              </Box>
              <Box width={6}>
                <Text>Lv{levelForXp(xp, MEMBER_XP_FACTOR)}</Text>
              </Box>
              <Text color="cyan">
                {gauge(levelProgress(xp, MEMBER_XP_FACTOR), 12)}
              </Text>
              <Text dimColor>
                {tf("status.memberLine", {
                  xp,
                  count: record?.tasksDone ?? 0,
                })}
              </Text>
            </Box>
          );
        })}
      </Window>

      {onClose && <Text dimColor>Esc {t("common.back")}</Text>}
    </Box>
  );
}
