// ─── XP Evaluator ────────────────────────────────────────────────────
// Uses Claude CLI to evaluate conversation quality and produce XP scores.

import { execSync } from "node:child_process";
import type { XpScores } from "./game-db.js";

// ─── Constants ───────────────────────────────────────────────────────

/** XP multiplier: LLM score (1-10) × this = XP gained per category */
const XP_MULTIPLIER = 10;

const EVALUATION_PROMPT = `You are evaluating the quality of a human user's interactions with an AI coding assistant.
Analyze the conversation below and rate the USER's skill (not the AI's) in each category from 1 to 10.

Categories:
1. articulation (伝達力): How clear, specific, and well-structured are the user's instructions? Do they provide context, constraints, and concrete examples instead of vague requests?
2. comprehension (理解力): Does the user demonstrate understanding of the AI's output? Do they ask meaningful follow-up questions? Do they try to learn from the interaction?
3. review (検証力): Does the user review the AI's generated code critically? Do they catch bugs, suggest improvements, or request specific fixes?
4. collaboration (協調力): Is the discussion constructive? Does the user build on the AI's suggestions rather than just accepting or rejecting them?
5. inquiry (探究力): Does the user ask good questions? Do they show curiosity and explore the problem space beyond the immediate task?

If the conversation is too short or trivial to evaluate meaningfully, give low scores (1-3).

Respond with ONLY a JSON object, no other text:
{"articulation": N, "comprehension": N, "review": N, "collaboration": N, "inquiry": N}

=== CONVERSATION ===
`;

// ─── Public API ──────────────────────────────────────────────────────

/** Evaluate a conversation and return XP scores */
export function evaluateConversation(conversationText: string): XpScores | null {
  const prompt = EVALUATION_PROMPT + conversationText;

  let output: string;
  try {
    output = execSync(
      `claude -p ${escapeShellArg(prompt)}`,
      {
        encoding: "utf8",
        timeout: 60_000,
        stdio: ["pipe", "pipe", "pipe"],
      },
    ).trim();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`  ⚠ Claude CLI evaluation failed: ${message}`);
    return null;
  }

  return parseEvaluationOutput(output);
}

// ─── Internal Helpers ────────────────────────────────────────────────

/** Parse LLM output to extract XP scores */
function parseEvaluationOutput(output: string): XpScores | null {
  // Try to extract JSON from the output (LLM might include extra text)
  const jsonMatch = output.match(/\{[^}]+\}/);
  if (!jsonMatch) {
    console.error("  ⚠ Could not find JSON in evaluation output");
    return null;
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
    const scores: XpScores = {
      articulation: clampScore(parsed.articulation) * XP_MULTIPLIER,
      comprehension: clampScore(parsed.comprehension) * XP_MULTIPLIER,
      review: clampScore(parsed.review) * XP_MULTIPLIER,
      collaboration: clampScore(parsed.collaboration) * XP_MULTIPLIER,
      inquiry: clampScore(parsed.inquiry) * XP_MULTIPLIER,
    };
    return scores;
  } catch {
    console.error("  ⚠ Failed to parse evaluation JSON");
    return null;
  }
}

/** Clamp a score value to 1-10, defaulting to 1 for invalid values */
function clampScore(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 1;
  return Math.max(1, Math.min(10, Math.round(value)));
}

/** Escape a string for safe use in shell commands */
function escapeShellArg(arg: string): string {
  // Use single quotes and escape any single quotes in the string
  return `'${arg.replace(/'/g, "'\\''")}'`;
}
