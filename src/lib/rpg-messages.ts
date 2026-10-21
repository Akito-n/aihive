// ─── RPG messages ─────────────────────────────────────────────────
// One-line story of what the party is doing, shown in the retro message
// window. The detailed log stays on the log screen.

import type { AdventureEvent } from "./adventure.js";
import { type Item, itemName, RARITY_COLORS, type Rarity } from "./gear.js";
import { t, tf } from "./i18n.js";
import type { Award, MovesResult } from "./progress.js";
import { titleName } from "./titles.js";

export interface RpgMessage {
  text: string;
  color?: string;
}

/** The message for a mailbox message, or none for the quiet kinds */
export function mailMessage(
  type: string,
  from: string,
  to: string,
  taskId: string | undefined,
): RpgMessage | undefined {
  const task = taskId ?? "";
  switch (type) {
    case "task":
      return {
        text: taskId
          ? tf("retro.msg.task", { name: to, task })
          : tf("retro.msg.order", { name: to, from }),
      };
    case "result":
      return { text: tf("retro.msg.result", { name: from }), color: "cyan" };
    case "error":
      return { text: tf("retro.msg.error", { name: from }), color: "red" };
    case "consult":
      return { text: tf("retro.msg.consult", { name: from, to }) };
    default:
      return undefined;
  }
}

export function levelUpMessage(name: string, level: number): RpgMessage {
  return {
    text: tf("retro.msg.levelUp", { name, level }),
    color: "yellow",
  };
}

export function poisonMessage(name: string, taskId: string): RpgMessage {
  return {
    text: tf("retro.msg.poison", { name, task: taskId }),
    color: "magenta",
  };
}

/** The message for a task's reward: a level up beats plain experience */
export function awardMessage(
  award: Award,
  taskId: string,
  /** The task's monster name, told when nothing bigger happened */
  monster?: string,
): RpgMessage {
  if (award.partyLevel.after > award.partyLevel.before) {
    return {
      text: tf("retro.msg.partyLevelUp", { level: award.partyLevel.after }),
      color: "yellow",
    };
  }
  if (award.memberLevel.after > award.memberLevel.before) {
    return levelUpMessage(award.member, award.memberLevel.after);
  }
  const title = award.titles[0];
  if (title) return titleMessage(title);
  // Rare finds first, then the boss, then any find
  const best = [...award.drops].sort(
    (a, b) => RARITY_RANK[b.rarity] - RARITY_RANK[a.rarity],
  )[0];
  if (best && RARITY_RANK[best.rarity] >= RARITY_RANK.epic) {
    return dropMessage(best);
  }
  const bossFloor = award.events.find((e) => e.boss && e.won);
  if (bossFloor) {
    return {
      text: tf("retro.msg.floorBoss", {
        floor: bossFloor.floor,
        monster: t(bossFloor.monster),
      }),
      color: "yellow",
    };
  }
  if (award.boss) {
    return {
      text: tf("retro.msg.boss", {
        task: taskId,
        name: award.member,
        xp: award.xp,
      }),
      color: "yellow",
    };
  }
  if (best) return dropMessage(best);
  if (award.events.length > 0) {
    return adventureMessage(award.events, award.progress.adventure.floor);
  }
  if (monster) {
    return {
      text: tf("retro.msg.slay", {
        name: award.member,
        monster,
        xp: award.xp,
      }),
    };
  }
  return { text: tf("retro.msg.xp", { name: award.member, xp: award.xp }) };
}

export function titleMessage(id: string): RpgMessage {
  const name = titleName(id);
  return {
    text: tf("retro.msg.title", { title: name ? t(name) : id }),
    color: "yellow",
  };
}

const RARITY_RANK: Record<Rarity, number> = {
  common: 0,
  rare: 1,
  epic: 2,
  legendary: 3,
};

export function dropMessage(item: Item): RpgMessage {
  return {
    text: tf("retro.msg.drop", { item: itemName(item) }),
    color: RARITY_COLORS[item.rarity],
  };
}

/** The dungeon's news: one battle told as it went, several summed up */
export function adventureMessage(
  events: AdventureEvent[],
  floorNow: number,
): RpgMessage {
  const last = events[events.length - 1];
  if (!last.won) {
    return {
      text: tf("retro.msg.floorLose", {
        monster: t(last.monster),
        floor: floorNow,
      }),
      color: "red",
    };
  }
  if (events.length > 1) {
    return {
      text: tf("retro.msg.explored", { floor: floorNow }),
      color: "cyan",
    };
  }
  return {
    text: tf("retro.msg.floorWin", {
      floor: last.floor,
      monster: t(last.monster),
    }),
    color: "cyan",
  };
}

/** News of special moves: a new one beats a stronger one */
export function movesMessage(result: MovesResult): RpgMessage | undefined {
  if (result.titles[0]) return titleMessage(result.titles[0]);
  const learned = result.learned[0];
  if (learned) {
    return {
      text: tf("retro.msg.moveLearned", { name: learned }),
      color: "yellow",
    };
  }
  const leveled = result.leveledUp[0];
  if (leveled) {
    return {
      text: tf("retro.msg.moveLevelUp", {
        name: leveled.name,
        level: leveled.level,
      }),
      color: "yellow",
    };
  }
  return undefined;
}
