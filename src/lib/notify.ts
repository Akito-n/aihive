import { execFile } from "node:child_process";
import type { NotifyMode } from "./config.js";

/** Runs a notifier program; injectable for tests */
export type Runner = (file: string, args: string[]) => void;

const defaultRunner: Runner = (file, args) => {
  // A missing notifier (no notify-send, say) is not worth reporting
  execFile(file, args, { timeout: 5000 }, () => {});
};

/**
 * Get the user's attention: ring the terminal bell, and for "desktop" also
 * show a desktop notification. Text can come from agents (task ids, names),
 * so it is passed as arguments, never through a shell.
 */
export function notify(
  mode: NotifyMode,
  title: string,
  body: string,
  options: {
    platform?: NodeJS.Platform;
    run?: Runner;
    bell?: () => void;
  } = {},
): void {
  if (mode === "off") return;
  const bell = options.bell ?? (() => process.stdout.write("\x07"));
  bell();
  if (mode !== "desktop") return;

  const run = options.run ?? defaultRunner;
  const clean = (s: string) => s.replace(/[\x00-\x1f\x7f]+/g, " ").trim();
  const platform = options.platform ?? process.platform;
  if (platform === "darwin") {
    // JSON string escaping (\" and \\) matches AppleScript's
    run("osascript", [
      "-e",
      `display notification ${JSON.stringify(clean(body))} with title ${JSON.stringify(clean(title))}`,
    ]);
  } else if (platform === "linux") {
    run("notify-send", ["--", clean(title), clean(body)]);
  }
}
