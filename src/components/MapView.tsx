import { Box, Text, useInput } from "ink";
import { useState } from "react";
import {
  areaOf,
  enemyPower,
  floorCost,
  isBossFloor,
  monstersOf,
} from "../lib/adventure.js";
import { hasEntry } from "../lib/codex.js";
import { maxTierAt, rarityWeights } from "../lib/gear.js";
import { t, tf } from "../lib/i18n.js";
import { type Progress, partyPowerOf } from "../lib/progress.js";
import { cursorGlyph } from "../lib/theme.js";
import type { TransKey } from "../locales/en.js";
import { Window } from "./Window.js";

interface MapViewProps {
  progress: Progress;
  /** Rows the map may take */
  height?: number;
  onClose?: () => void;
}

export interface MapRow {
  kind: "area" | "band" | "boss";
  from: number;
  to: number;
  area?: TransKey;
  monsters: TransKey[];
}

/** The map's rows down to the area below the deepest floor reached */
export function mapRows(deepest: number): MapRow[] {
  const last = Math.ceil((deepest + 10) / 10) * 10;
  const rows: MapRow[] = [];
  for (let from = 1; from <= last; from += 5) {
    if ((from - 1) % 10 === 0) {
      rows.push({
        kind: "area",
        from,
        to: from + 9,
        area: areaOf(from),
        monsters: [],
      });
    }
    const to = from + 4;
    const bossFloor = isBossFloor(to) ? to : undefined;
    rows.push({
      kind: "band",
      from,
      to: bossFloor ? to - 1 : to,
      monsters: monstersOf(from),
    });
    if (bossFloor) {
      rows.push({
        kind: "boss",
        from: bossFloor,
        to: bossFloor,
        monsters: monstersOf(bossFloor),
      });
    }
  }
  return rows;
}

/** How an even fight looks: the party's power against the floor's enemy */
export function oddsColor(power: number, enemy: number): string {
  if (power * 0.8 >= enemy) return "green";
  if (power * 1.2 >= enemy) return "yellow";
  return "red";
}

/** The dungeon map: areas, the monsters met there and where the party is */
export function MapView({ progress, height = 12, onClose }: MapViewProps) {
  const { adventure, codex } = progress;
  const rows = mapRows(adventure.deepest);
  const here = rows.findIndex(
    (r) =>
      r.kind !== "area" && adventure.floor >= r.from && adventure.floor <= r.to,
  );
  const [offset, setOffset] = useState<number>();
  const visible = Math.max(3, height);
  const maxStart = Math.max(0, rows.length - visible);
  const start =
    offset ?? Math.max(0, Math.min(maxStart, here - Math.floor(visible / 2)));

  useInput(
    (input, key) => {
      if (key.escape || input === "q" || input === "M") onClose?.();
      else if (key.upArrow || input === "k") setOffset(Math.max(0, start - 1));
      else if (key.downArrow || input === "j")
        setOffset(Math.min(maxStart, start + 1));
    },
    { isActive: Boolean(onClose) },
  );

  const power = partyPowerOf(progress);
  const enemy = enemyPower(adventure.floor);
  const nextBoss = Math.ceil(adventure.floor / 10) * 10;
  const weights = rarityWeights(adventure.floor);
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  const share = (w: number) => Math.round((100 * w) / total);
  const tier = maxTierAt(adventure.floor);

  return (
    <Box flexDirection="column" gap={1}>
      <Window title={t("map.title")}>
        <Text>
          {tf("map.here", {
            floor: adventure.floor,
            area: t(areaOf(adventure.floor)),
          })}
          <Text dimColor>
            {"  "}
            {tf("map.deepest", { floor: adventure.deepest })}
          </Text>
        </Text>
        <Text>
          <Text color={oddsColor(power, enemy)}>
            {tf("map.odds", { power, enemy })}
          </Text>
          <Text dimColor>
            {"  "}
            {nextBoss === adventure.floor
              ? t("map.bossHere")
              : tf("map.nextBoss", { floors: nextBoss - adventure.floor })}
            {"  "}
            {tf("map.points", {
              points: adventure.points,
              cost: floorCost(adventure.floor),
            })}
          </Text>
        </Text>
        <Text dimColor wrap="truncate-end">
          {tf("map.drops", {
            from: Math.max(0, tier - 2),
            to: tier,
            common: share(weights.common),
            rare: share(weights.rare),
            epic: share(weights.epic),
            legendary: share(weights.legendary),
          })}
        </Text>
      </Window>

      <Window title={t("map.floors")}>
        {rows.slice(start, start + visible).map((row, i) => {
          const isHere = start + i === here;
          const reached = row.from <= adventure.deepest;
          if (row.kind === "area") {
            return (
              <Text key={`a${row.from}`} bold color={reached ? "cyan" : "gray"}>
                ■ {row.area ? t(row.area) : ""}
                <Text dimColor>
                  {"  "}
                  {tf("codex.floors", { from: row.from, to: row.to })}
                </Text>
              </Text>
            );
          }
          const names = row.monsters
            .map((m) => (hasEntry(codex, "monsters", m) ? t(m) : "？？？？"))
            .join("・");
          const beaten =
            row.kind === "boss" && hasEntry(codex, "monsters", row.monsters[0]);
          return (
            <Box key={`${row.kind}${row.from}`} gap={1}>
              <Text>{isHere ? cursorGlyph() : " "}</Text>
              <Box width={15} flexShrink={0}>
                <Text dimColor={!reached}>
                  {row.from === row.to
                    ? tf("codex.floor", { floor: row.from })
                    : tf("codex.floors", { from: row.from, to: row.to })}
                </Text>
              </Box>
              {row.kind === "boss" && (
                <Text color={reached ? "yellow" : "gray"}>{t("map.boss")}</Text>
              )}
              <Text
                color={reached ? undefined : "gray"}
                bold={isHere}
                wrap="truncate-end"
              >
                {names}
              </Text>
              {beaten && <Text color="green">✓</Text>}
              {isHere && <Text color="yellow">{t("map.youAreHere")}</Text>}
            </Box>
          );
        })}
      </Window>
      {onClose && <Text dimColor>{t("map.help")}</Text>}
    </Box>
  );
}
