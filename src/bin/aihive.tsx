#!/usr/bin/env node
import React from "react";
import { render } from "ink";
import { App } from "../components/App.js";
import { checkDependencies } from "../lib/dependencies.js";
import { getConfigPath } from "../lib/config.js";

const args = process.argv.slice(2);

if (args.includes("-h") || args.includes("--help") || args.includes("help")) {
  console.log(`
aihive - tmux + Claude Code multi-agent system (React Ink TUI)

Usage: aihive [options]

Options:
  -h, --help         Show this help message

Config: ${getConfigPath()}
`);
  process.exit(0);
}

checkDependencies();

render(<App />);
