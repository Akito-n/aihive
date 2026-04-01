import fs from "node:fs";
import path from "node:path";
import { initInstructions } from "./config.js";
import type { AihiveConfig } from "./config.js";
import { MessageBus } from "./mailbox.js";

export function initWorkspace(config: AihiveConfig): MessageBus {
  const projectDir = process.cwd();

  // Create directories under .aihive/
  const aihiveDir = path.join(projectDir, ".aihive");
  for (const dir of ["status", "output", "skills", "memory"]) {
    fs.mkdirSync(path.join(aihiveDir, dir), { recursive: true });
  }

  // Copy bundled instructions to ~/.aihive/instructions/ if not present
  initInstructions();

  // Initialize mailbox system
  const agentNames = config.agents.map((a) => a.name);
  const bus = new MessageBus(projectDir);
  bus.init(agentNames);
  bus.clear(agentNames);

  // Init dashboard
  const agentRows = config.agents
    .map((a) => `| ${a.name.padEnd(14)} | ⏳ Pending | - |`)
    .join("\n");

  fs.writeFileSync(
    path.join(aihiveDir, "status", "dashboard.md"),
    `# Multi-Agent Dashboard

## 現在のタスク
待機中

## エージェント状況
| Agent | Status | Updated |
|---|---|---|
${agentRows}

## Log
- システム起動待ち
`,
  );

  return bus;
}
