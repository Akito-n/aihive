// ─── Quest monsters ───────────────────────────────────────────────
// Each task shows as a monster in the quest window, picked from its
// description. A parent task with subtasks is a boss whose HP is the
// subtasks still open. Only for the look; tasks are never changed.

import type { TransKey } from "../locales/en.js";
import type { Task } from "./tasks.js";

/** First match wins, so the more specific kinds come first */
const KINDS: [RegExp, TransKey][] = [
  [/review|レビュー/i, "quest.mimic"],
  [/test|spec|テスト/i, "quest.golem"],
  [/fix|bug|error|バグ|修正|エラー|不具合/i, "quest.slime"],
  [/refactor|clean ?up|リファクタ|整理/i, "quest.spaghetti"],
  [/doc|readme|ドキュメント|文書|説明/i, "quest.ghost"],
  [/perf|speed|optimi|速|遅|最適化/i, "quest.moth"],
  [/\bui\b|design|style|css|画面|デザイン|見た目/i, "quest.imp"],
  [/add|feat|implement|追加|実装|作成/i, "quest.knight"],
];

export function questMonsterOf(task: Task): TransKey {
  for (const [pattern, key] of KINDS) {
    if (pattern.test(task.description)) return key;
  }
  return "quest.stray";
}

/** A boss's HP: subtasks still open out of all of them */
export function bossHp(
  task: Task,
  all: Task[],
): { left: number; total: number } | undefined {
  if (/-\d+$/.test(task.id)) return undefined;
  const subtasks = all.filter((t) => t.id.startsWith(`${task.id}-`));
  if (subtasks.length === 0) return undefined;
  return {
    left: subtasks.filter((t) => t.state !== "done").length,
    total: subtasks.length,
  };
}
