import { Box, Text, useInput } from "ink";
import { useEffect, useState } from "react";
import type {
  BattleStats,
  Character,
  EvaluationRecord,
} from "../lib/game-db.js";
import {
  calculateBattleStats,
  getCharacter,
  getEvaluationHistory,
  initGameDb,
  JOB_KEYS,
  JOBS,
  updateCharacterJob,
  xpForLevel,
} from "../lib/game-db.js";

interface CharacterScreenProps {
  onBack: () => void;
}

type ScreenMode = "view" | "select-job";

interface SkillStatDef {
  key: keyof Pick<
    Character,
    | "statArticulation"
    | "statComprehension"
    | "statReview"
    | "statCollaboration"
    | "statInquiry"
  >;
  label: string;
  jaLabel: string;
  color: string;
}

const SKILL_STATS: SkillStatDef[] = [
  {
    key: "statArticulation",
    label: "Articulation",
    jaLabel: "伝達力",
    color: "cyan",
  },
  {
    key: "statComprehension",
    label: "Comprehension",
    jaLabel: "理解力",
    color: "green",
  },
  { key: "statReview", label: "Review", jaLabel: "検証力", color: "yellow" },
  {
    key: "statCollaboration",
    label: "Collaboration",
    jaLabel: "協調力",
    color: "blue",
  },
  { key: "statInquiry", label: "Inquiry", jaLabel: "探究力", color: "magenta" },
];

interface BattleStatDef {
  key: keyof BattleStats;
  label: string;
  color: string;
}

const BATTLE_STATS: BattleStatDef[] = [
  { key: "hp", label: "HP ", color: "red" },
  { key: "mp", label: "MP ", color: "blue" },
  { key: "str", label: "STR", color: "red" },
  { key: "int", label: "INT", color: "magenta" },
  { key: "dex", label: "DEX", color: "green" },
];

function statBar(value: number, max: number, width: number = 20): string {
  const safeMax = max > 0 ? max : 1;
  const filled = Math.max(
    0,
    Math.min(width, Math.round((value / safeMax) * width)),
  );
  return "█".repeat(filled) + "░".repeat(width - filled);
}

function xpBar(
  current: number,
  nextLevel: number,
  prevLevel: number,
  width: number = 24,
): string {
  const range = nextLevel - prevLevel;
  const progress = current - prevLevel;
  const ratio = range > 0 ? progress / range : 0;
  const filled = Math.max(0, Math.min(width, Math.round(ratio * width)));
  return "█".repeat(filled) + "░".repeat(width - filled);
}

export function CharacterScreen({ onBack }: CharacterScreenProps) {
  const [character, setCharacter] = useState<Character | null>(null);
  const [history, setHistory] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<ScreenMode>("view");
  const [jobSelectIndex, setJobSelectIndex] = useState(0);
  const [blink, setBlink] = useState(true);

  useEffect(() => {
    const timer = setInterval(() => setBlink((v) => !v), 700);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await initGameDb();
        const char = getCharacter();
        setCharacter(char);
        setHistory(getEvaluationHistory(5));
        setJobSelectIndex(JOB_KEYS.indexOf(char.job));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Main view input
  useInput(
    (_input, key) => {
      if (key.escape) {
        onBack();
      }
      if (key.return || _input === "j") {
        setMode("select-job");
      }
    },
    { isActive: mode === "view" },
  );

  // Job selection input
  useInput(
    (_input, key) => {
      if (key.escape) {
        setMode("view");
        return;
      }
      if (key.upArrow) {
        setJobSelectIndex((prev) => Math.max(0, prev - 1));
        return;
      }
      if (key.downArrow) {
        setJobSelectIndex((prev) => Math.min(JOB_KEYS.length - 1, prev + 1));
        return;
      }
      if (key.return) {
        const selectedJob = JOB_KEYS[jobSelectIndex];
        updateCharacterJob(selectedJob);
        setCharacter(getCharacter());
        setMode("view");
      }
    },
    { isActive: mode === "select-job" },
  );

  if (loading) {
    return (
      <Box paddingY={1} paddingX={2}>
        <Text dimColor>Loading character data...</Text>
      </Box>
    );
  }

  if (error || !character) {
    return (
      <Box flexDirection="column" paddingY={1} paddingX={2}>
        <Text color="red">Error: {error ?? "Character not found"}</Text>
        <Text dimColor>Esc Back</Text>
      </Box>
    );
  }

  // Job selection screen
  if (mode === "select-job") {
    return (
      <Box flexDirection="column" alignItems="center" paddingY={1}>
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor="yellow"
          paddingX={3}
          paddingY={1}
        >
          <Text bold color="yellow">
            Select Job
          </Text>
          <Box marginTop={1} flexDirection="column">
            {JOB_KEYS.map((jobKey, i) => {
              const job = JOBS[jobKey];
              const isSelected = i === jobSelectIndex;
              const isCurrent = jobKey === character.job;
              return (
                <Box key={jobKey} gap={1}>
                  <Text color="yellow">{isSelected ? "▶" : " "}</Text>
                  <Text
                    bold={isSelected}
                    color={isSelected ? "yellow" : "white"}
                  >
                    {job.icon} {job.name.padEnd(10)}
                  </Text>
                  <Text dimColor={!isSelected}>{job.description}</Text>
                  {isCurrent && <Text color="green"> (current)</Text>}
                </Box>
              );
            })}
          </Box>
          <Box marginTop={1} gap={1}>
            <Text backgroundColor="gray" color="black" bold>
              {" "}
              ↑↓{" "}
            </Text>
            <Text> Select </Text>
            <Text backgroundColor="green" color="black" bold>
              {" "}
              Enter{" "}
            </Text>
            <Text> Confirm </Text>
            <Text backgroundColor="gray" color="black" bold>
              {" "}
              Esc{" "}
            </Text>
            <Text> Cancel </Text>
          </Box>
        </Box>
      </Box>
    );
  }

  // Main character view
  const jobDef = JOBS[character.job] ?? JOBS.sage;
  const nextLevelXp = xpForLevel(character.level + 1);
  const currentLevelXp = xpForLevel(character.level);
  const progressPercent =
    nextLevelXp > currentLevelXp
      ? Math.round(
          ((character.totalXp - currentLevelXp) /
            (nextLevelXp - currentLevelXp)) *
            100,
        )
      : 100;

  const battle = calculateBattleStats(character);
  const maxBattle = Math.max(
    battle.hp,
    battle.mp,
    battle.str,
    battle.int,
    battle.dex,
    1,
  );

  const maxSkill = Math.max(
    character.statArticulation,
    character.statComprehension,
    character.statReview,
    character.statCollaboration,
    character.statInquiry,
    1,
  );

  return (
    <Box flexDirection="column" alignItems="center" paddingY={1}>
      <Box
        flexDirection="column"
        borderStyle="round"
        borderColor="magenta"
        paddingX={3}
        paddingY={1}
      >
        {/* Character Info */}
        <Text bold color="magenta">
          {jobDef.icon} Character Status
        </Text>

        <Box marginTop={1} flexDirection="column">
          <Box gap={1}>
            <Text bold>Name:</Text>
            <Text color="white">{character.name}</Text>
          </Box>
          <Box gap={1}>
            <Text bold>Job:</Text>
            <Text color="yellow">
              {jobDef.icon} {jobDef.name}
            </Text>
            <Text color="gray"> ─ {jobDef.description}</Text>
          </Box>
          <Box gap={1}>
            <Text bold>Level:</Text>
            <Text color="yellow">{character.level}</Text>
          </Box>
          <Box gap={1}>
            <Text bold>XP:</Text>
            <Text>
              {character.totalXp} / {nextLevelXp}
            </Text>
            <Text color="yellow">
              [{xpBar(character.totalXp, nextLevelXp, currentLevelXp)}]
            </Text>
            <Text dimColor>{progressPercent}%</Text>
          </Box>
        </Box>

        {/* Battle Stats */}
        <Box marginTop={1} flexDirection="column">
          <Text bold color="red">
            Battle Stats
          </Text>
          {BATTLE_STATS.map((stat) => {
            const value = battle[stat.key];
            return (
              <Box key={stat.key} gap={1}>
                <Text bold color={stat.color}>
                  {stat.label}
                </Text>
                <Text color={stat.color}>{statBar(value, maxBattle, 16)}</Text>
                <Text> {String(value).padStart(4)}</Text>
              </Box>
            );
          })}
        </Box>

        {/* Skill XP */}
        <Box marginTop={1} flexDirection="column">
          <Text bold color="cyan">
            Skill XP
          </Text>
          {SKILL_STATS.map((stat) => {
            const value = character[stat.key];
            return (
              <Box key={stat.key} gap={1}>
                <Text color={stat.color}>{stat.jaLabel}</Text>
                <Text dimColor>{stat.label.padEnd(14)}</Text>
                <Text color={stat.color}>{statBar(value, maxSkill, 16)}</Text>
                <Text> {String(value).padStart(4)}</Text>
              </Box>
            );
          })}
        </Box>

        {/* Recent Evaluations */}
        {history.length > 0 && (
          <Box marginTop={1} flexDirection="column">
            <Text bold color="gray">
              Recent Evaluations
            </Text>
            {history.map((record) => (
              <Box key={record.id} gap={1}>
                <Text dimColor>{record.evaluatedAt.slice(0, 10)}</Text>
                <Text color="green">
                  +{String(record.xpTotal).padStart(3)} XP
                </Text>
                <Text dimColor>{record.sessionId.slice(0, 8)}</Text>
              </Box>
            ))}
          </Box>
        )}

        {history.length === 0 && (
          <Box marginTop={1}>
            <Text dimColor>No evaluations yet. Run: aihive --evaluate</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={1} gap={1}>
        <Text backgroundColor={blink ? "yellow" : "gray"} color="black" bold>
          {" "}
          Enter{" "}
        </Text>
        <Text> Change Job </Text>
        <Text backgroundColor="gray" color="black" bold>
          {" "}
          Esc{" "}
        </Text>
        <Text> Back </Text>
      </Box>
    </Box>
  );
}
