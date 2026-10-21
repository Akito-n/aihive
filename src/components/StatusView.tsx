import { Box, Text, useInput } from "ink";
import {
  floorCost,
  SKILL_KEYS,
  SKILL_LABEL_KEYS,
  skillLevel,
} from "../lib/adventure.js";
import { t, tf } from "../lib/i18n.js";
import { toSlug } from "../lib/mailbox.js";
import {
  levelForXp,
  levelProgress,
  MEMBER_XP_FACTOR,
  moveLevel,
  PARTY_XP_FACTOR,
  type Progress,
  xpForLevel,
} from "../lib/progress.js";
import { gaugeFill, jobKeyOf } from "../lib/theme.js";
import { TITLES, titleName } from "../lib/titles.js";
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
  return gaugeFill().repeat(filled) + "░".repeat(width - filled);
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
  const newestTitle = titleName(
    progress.titles[progress.titles.length - 1] ?? "",
  );
  return (
    <Box flexDirection="column" gap={1}>
      <Window title={t("status.title")}>
        <Box gap={2}>
          <Text bold>
            {t("status.party")} Lv{partyLevel}
          </Text>
          {newestTitle && <Text color="yellow">「{t(newestTitle)}」</Text>}
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

      <Window title={t("status.adventure")}>
        <Box gap={3}>
          <Text bold>
            {tf("status.floor", { floor: progress.adventure.floor })}
          </Text>
          <Text>
            {tf("status.deepest", { floor: progress.adventure.deepest })}
          </Text>
          <Text>
            {tf("status.record", {
              wins: progress.adventure.wins,
              losses: progress.adventure.losses,
            })}
          </Text>
        </Box>
        <Box gap={2}>
          <Text color="green">
            {gauge(
              progress.adventure.points / floorCost(progress.adventure.floor),
              20,
            )}
          </Text>
          <Text dimColor>
            {tf("status.nextFloor", {
              points: progress.adventure.points,
              cost: floorCost(progress.adventure.floor),
            })}
          </Text>
        </Box>
      </Window>

      <Window title={t("status.skills")}>
        {members.map((m) => {
          const skills = progress.members[toSlug(m.name)]?.skills;
          return (
            <Box key={m.name} gap={1}>
              <Box width={16}>
                <Text wrap="truncate-end">{m.name}</Text>
              </Box>
              {SKILL_KEYS.map((key) => (
                <Box key={key} width={14}>
                  <Text>
                    {t(SKILL_LABEL_KEYS[key])} {skillLevel(skills?.[key] ?? 0)}
                  </Text>
                </Box>
              ))}
            </Box>
          );
        })}
      </Window>

      <Window title={t("status.moves")}>
        {Object.keys(progress.moves).length === 0 ? (
          <Text dimColor>{t("status.movesEmpty")}</Text>
        ) : (
          Object.entries(progress.moves)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .map(([name, uses]) => (
              <Box key={name} gap={1}>
                <Box width={28} flexShrink={0}>
                  <Text wrap="truncate-end">{name}</Text>
                </Box>
                <Box width={8}>
                  <Text color="yellow">★{moveLevel(uses)}</Text>
                </Box>
                <Text dimColor>{tf("status.moveLine", { count: uses })}</Text>
              </Box>
            ))
        )}
      </Window>

      <Window
        title={tf("status.titles", {
          count: progress.titles.length,
          total: TITLES.length,
        })}
      >
        {progress.titles.length === 0 ? (
          <Text dimColor>{t("status.titlesEmpty")}</Text>
        ) : (
          <Box columnGap={2} flexWrap="wrap">
            {progress.titles.map((id) => {
              const name = titleName(id);
              return name ? <Text key={id}>「{t(name)}」</Text> : null;
            })}
          </Box>
        )}
      </Window>

      {onClose && <Text dimColor>Esc {t("common.back")}</Text>}
    </Box>
  );
}
