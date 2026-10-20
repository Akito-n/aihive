// ─── RPG messages ─────────────────────────────────────────────────
// One-line story of what the party is doing, shown in the retro message
// window. The detailed log stays on the log screen.

import { tf } from "./i18n.js";
import type { Award } from "./progress.js";

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
export function awardMessage(award: Award, taskId: string): RpgMessage {
  if (award.partyLevel.after > award.partyLevel.before) {
    return {
      text: tf("retro.msg.partyLevelUp", { level: award.partyLevel.after }),
      color: "yellow",
    };
  }
  if (award.memberLevel.after > award.memberLevel.before) {
    return levelUpMessage(award.member, award.memberLevel.after);
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
  return { text: tf("retro.msg.xp", { name: award.member, xp: award.xp }) };
}
