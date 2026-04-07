// ─── Evaluate Command ────────────────────────────────────────────────
// Orchestrates the full evaluation pipeline:
// 1. Find JSONL history files
// 2. Extract unevaluated sessions
// 3. Run LLM evaluation
// 4. Store results and update character

import {
  initGameDb,
  getCharacter,
  addXp,
  isSessionEvaluated,
  markSessionEvaluated,
  calculateLevel,
  xpForLevel,
} from "./game-db.js";
import { findHistoryFiles, extractSessions, formatForEvaluation } from "./history-parser.js";
import { evaluateConversation } from "./xp-evaluator.js";
import type { Session } from "./history-parser.js";

// ─── Constants ───────────────────────────────────────────────────────

/** Maximum sessions to evaluate per run (cost control) */
const MAX_SESSIONS_PER_RUN = 10;

/** Minimum turns in a session to be worth evaluating */
const MIN_TURNS = 2;

// ─── Main Entry Point ────────────────────────────────────────────────

export async function runEvaluation(): Promise<void> {
  console.log("🎮 aihive - Conversation Evaluation\n");

  // 1. Initialize database
  await initGameDb();
  const charBefore = getCharacter();
  console.log(`  Character: ${charBefore.name} (Lv.${charBefore.level})`);
  console.log(`  Total XP: ${charBefore.totalXp}\n`);

  // 2. Find all history files
  const files = findHistoryFiles();
  if (files.length === 0) {
    console.log("  No conversation history found in ~/.claude/projects/");
    return;
  }
  console.log(`  Found ${files.length} history files\n`);

  // 3. Extract unevaluated sessions
  const unevaluated: Session[] = [];

  for (const { filePath } of files) {
    const sessions = extractSessions(filePath);
    for (const session of sessions) {
      if (session.turns.length < MIN_TURNS) continue;
      if (isSessionEvaluated(session.filePath, session.sessionId)) continue;
      unevaluated.push(session);
    }
  }

  if (unevaluated.length === 0) {
    console.log("  No new sessions to evaluate.");
    return;
  }

  const toProcess = unevaluated.slice(0, MAX_SESSIONS_PER_RUN);
  const remaining = unevaluated.length - toProcess.length;

  console.log(
    `  ${unevaluated.length} unevaluated sessions found. Processing ${toProcess.length}...\n`,
  );

  // 4. Evaluate each session
  let evaluated = 0;
  let totalXpGained = 0;
  let prevLevel = charBefore.level;

  for (const session of toProcess) {
    const turnCount = session.turns.length;
    const shortId = session.sessionId.slice(0, 8);
    console.log(`  [${evaluated + 1}/${toProcess.length}] Session ${shortId}... (${turnCount} turns)`);

    const conversationText = formatForEvaluation(session);
    const scores = evaluateConversation(conversationText);

    if (!scores) {
      console.log("    → Skipped (evaluation failed)");
      continue;
    }

    // Store evaluation
    markSessionEvaluated(session.filePath, session.sessionId, scores);
    const updatedChar = addXp(scores);

    const sessionXp =
      scores.articulation + scores.comprehension + scores.review +
      scores.collaboration + scores.inquiry;

    totalXpGained += sessionXp;
    evaluated++;

    console.log(`    → +${sessionXp} XP (伝:${scores.articulation} 理:${scores.comprehension} 検:${scores.review} 協:${scores.collaboration} 探:${scores.inquiry})`);

    // Check for level up
    if (updatedChar.level > prevLevel) {
      console.log(`\n  🎉 LEVEL UP! ${prevLevel} → ${updatedChar.level}\n`);
      prevLevel = updatedChar.level;
    }
  }

  // 5. Print summary
  const charAfter = getCharacter();
  const nextLevelXp = xpForLevel(charAfter.level + 1);

  console.log("\n  ─── Summary ───");
  console.log(`  Sessions evaluated: ${evaluated}`);
  console.log(`  XP gained: +${totalXpGained}`);
  console.log(`  ${charAfter.name} Lv.${charAfter.level} (${charAfter.totalXp} / ${nextLevelXp} XP)`);

  if (remaining > 0) {
    console.log(`\n  ${remaining} sessions remaining. Run again to evaluate more.`);
  }

  console.log();
}
