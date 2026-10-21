// ─── Pane Keys ───────────────────────────────────────────────────────
// Turns keys pressed in aihive into keys for an agent's tmux pane, for
// answering choice menus and for the direct mode that types into the pane.

import type { Key } from "ink";
import { isShellCommand } from "./tmux.js";

/** What to send to a pane: tmux key names, or text typed as is */
export type PaneKeys = { keys: string[] } | { literal: string };

const NAMED_KEYS: [keyof Key, string][] = [
  ["return", "Enter"],
  ["escape", "Escape"],
  ["upArrow", "Up"],
  ["downArrow", "Down"],
  ["leftArrow", "Left"],
  ["rightArrow", "Right"],
  ["pageUp", "PPage"],
  ["pageDown", "NPage"],
  ["home", "Home"],
  ["end", "End"],
  // Terminals send DEL for Backspace, which Ink reports as delete
  ["backspace", "BSpace"],
  ["delete", "BSpace"],
];

/** The key that leaves direct mode: Ctrl+Q */
export function isDirectExitKey(input: string, key: Key): boolean {
  return key.ctrl && input === "q";
}

/** Map one key press from Ink to what the pane should receive */
export function toPaneKeys(input: string, key: Key): PaneKeys | undefined {
  if (key.tab) return { keys: [key.shift ? "BTab" : "Tab"] };
  for (const [flag, name] of NAMED_KEYS) {
    if (key[flag]) return { keys: [name] };
  }
  if (!input) return undefined;
  if (key.ctrl) return { keys: [`C-${input}`] };
  if (key.meta) return { keys: [`M-${input}`] };
  return { literal: input };
}

/**
 * Keys that answer a choice menu while the input is empty. They are sent
 * without an Enter: Claude's menus act on Enter, so a digit followed by
 * Enter would also confirm whatever is highlighted (for the folder trust
 * check that is "No, exit", which quits the CLI).
 */
export function promptKeys(input: string, key: Key): string[] | undefined {
  if (key.upArrow) return ["Up"];
  if (key.downArrow) return ["Down"];
  if (key.return) return ["Enter"];
  if (!key.ctrl && !key.meta && /^[1-9yn]$/.test(input)) return [input];
  return undefined;
}

/** Wait this long after a launch before a shell in the pane means an exit */
export const LAUNCH_GRACE_MS = 15_000;

/**
 * Whether an agent's CLI has exited and left its pane at a shell. Right
 * after a launch the shell is still in front while the CLI starts, so a
 * shell only counts once the CLI was seen running or the grace time passed.
 */
export function hasAgentExited(
  command: string | undefined,
  sawCli: boolean,
  msSinceLaunch: number,
): boolean {
  if (!isShellCommand(command)) return false;
  return sawCli || msSinceLaunch >= LAUNCH_GRACE_MS;
}
