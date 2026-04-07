export const en = {
  // ─── Common ─────────────────────────────────────────────────────
  "common.select": "Select",
  "common.confirm": "Confirm",
  "common.back": "Back",
  "common.cancel": "Cancel",
  "common.save": "Save",
  "common.error": "Error",
  "common.loading": "Loading...",

  // ─── Main Menu ──────────────────────────────────────────────────
  "mainMenu.tagline": "⬡  Multi-Agent Orchestration  ⬡",
  "mainMenu.startAgents": "Start Agents",
  "mainMenu.startAgents.desc": "Launch all agents in tmux",
  "mainMenu.settings": "Settings",
  "mainMenu.settings.desc": "Configure workers and options",
  "mainMenu.quit": "Quit",
  "mainMenu.quit.desc": "Exit aihive",

  // ─── Settings ───────────────────────────────────────────────────
  "settings.title": "Settings",
  "settings.agentNames": "Agent Names",
  "settings.agentNames.desc": "Edit agent names and roles",
  "settings.quickCommands": "Quick Commands",
  "settings.quickCommands.desc": "Edit // quick commands",
  "settings.character": "Character",
  "settings.character.desc": "View RPG character stats",
  "settings.language": "Language",
  "settings.language.desc": "Switch display language",
  "settings.back": "Back",
  "settings.back.desc": "Return to main menu",

  // ─── Language ───────────────────────────────────────────────────
  "language.title": "Language",
  "language.en": "English",
  "language.ja": "日本語",
  "language.current": "(current)",

  // ─── Character ──────────────────────────────────────────────────
  "character.loading": "Loading character data...",
  "character.notFound": "Character not found",
  "character.title": "Character Status",
  "character.name": "Name:",
  "character.job": "Job:",
  "character.level": "Level:",
  "character.xp": "XP:",
  "character.selectJob": "Select Job",
  "character.changeJob": "Change Job",
  "character.battleStats": "Battle Stats",
  "character.skillXp": "Skill XP",
  "character.recentEvaluations": "Recent Evaluations",
  "character.noEvaluations": "No evaluations yet. Run: aihive --evaluate",

  // ─── Skill Names ───────────────────────────────────────────────
  "skill.articulation": "Articulation",
  "skill.comprehension": "Comprehension",
  "skill.review": "Review",
  "skill.collaboration": "Collaboration",
  "skill.inquiry": "Inquiry",
  "skill.articulation.short": "Art",
  "skill.comprehension.short": "Comp",
  "skill.review.short": "Rev",
  "skill.collaboration.short": "Collab",
  "skill.inquiry.short": "Inq",

  // ─── Header ─────────────────────────────────────────────────────
  "header.agents": "Agents",
  "header.tasks": "Tasks",
  "header.skills": "Skills",
  "header.memory": "Memory",
  "header.session": "Session",

  // ─── Status ─────────────────────────────────────────────────────
  "status.idle": "IDLE",
  "status.settings": "SETTINGS",
  "status.starting": "STARTING",
  "status.running": "RUNNING",
  "status.stopping": "STOPPING",

  // ─── Log View ──────────────────────────────────────────────────
  "log.entries": "entries",
  "log.close": "to close",
  "log.noEvents": "No events yet",

  // ─── Help Bar ───────────────────────────────────────────────────
  "help.start": "Start",
  "help.select": "Select",
  "help.sendCommand": "Send command",
  "help.overview": "Overview",
  "help.log": "Log",
  "help.stop": "Stop",
  "help.quit": "Quit",

  // ─── Startup ────────────────────────────────────────────────────
  "startup.checkDeps": "Checking dependencies...",
  "startup.createSession": "Creating tmux session...",
  "startup.spawnOrchestrator": "Spawning Orchestrator...",
  "startup.spawnCoordinator": "Spawning Coordinator...",
  "startup.spawnWorkers": "Spawning Workers...",
  "startup.allReady": "All agents ready.",

  // ─── Agent Editor ───────────────────────────────────────────────
  "agentEditor.title": "Agent Configuration",
  "agentEditor.instructions":
    "↑↓←→ navigate | Enter edit | d delete | Esc back",
  "agentEditor.addAgent": "+ Add Agent",
  "agentEditor.saveBack": "Save & Back",
  "agentEditor.fieldName": "Name",
  "agentEditor.fieldRole": "Role",
  "agentEditor.fieldCli": "CLI",
  "agentEditor.fieldModel": "Model",

  // ─── Command Input ──────────────────────────────────────────────
  "commandInput.placeholder": "Send a message...",
  "commandInput.commands": "Commands",
  "commandInput.actionRequired": "⚡ Action required:",
  "commandInput.pressKey": "Press a key to respond (input must be empty)",
} as const;

export type TransKey = keyof typeof en;
