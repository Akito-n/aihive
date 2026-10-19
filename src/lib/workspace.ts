import fs from "node:fs";
import path from "node:path";
import type { AihiveConfig } from "./config.js";
import { initInstructions } from "./config.js";
import { MessageBus } from "./mailbox.js";

/**
 * Prepare .aihive/ and the mailbox. With `reset: false` (reattaching to a
 * running session) existing messages are left untouched.
 */
export function initWorkspace(
  config: AihiveConfig,
  { reset = true }: { reset?: boolean } = {},
): MessageBus {
  const projectDir = process.cwd();

  // Create directories under .aihive/
  const aihiveDir = path.join(projectDir, ".aihive");
  for (const dir of ["output", "skills", "memory"]) {
    fs.mkdirSync(path.join(aihiveDir, dir), { recursive: true });
  }

  // Copy bundled instructions to ~/.aihive/instructions/ if not present
  initInstructions();

  // Initialize mailbox system
  const agentNames = config.agents.map((a) => a.name);
  const bus = new MessageBus(projectDir);
  bus.init(agentNames);
  if (reset) bus.clear(agentNames);

  return bus;
}
