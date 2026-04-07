#!/usr/bin/env node
import { render } from "ink";
import { App } from "../components/App.js";
import { getConfigPath } from "../lib/config.js";
import { checkDependencies } from "../lib/dependencies.js";

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help") || args.includes("help")) {
  console.log(`
aihive - tmux + Claude Code multi-agent system (React Ink TUI)

Usage: aihive [options]

Options:
  -h, --help         Show this help message
  --evaluate         Evaluate conversation history and gain XP

Config: ${getConfigPath()}
`);
  process.exit(0);
}

if (args.includes("--evaluate")) {
  const { runEvaluation } = await import("../lib/evaluate-command.js");
  await runEvaluation();
  process.exit(0);
}

checkDependencies();

render(<App />);
