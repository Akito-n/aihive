import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

export interface SlashCommand {
  name: string; // e.g. "create-pr-description"
  description: string; // first heading or first line
  source: "global" | "project";
}

/**
 * Load slash commands from ~/.claude/commands/ and ./.claude/commands/
 */
export function loadSlashCommands(projectDir?: string): SlashCommand[] {
  const commands: SlashCommand[] = [];

  // Global commands
  const globalDir = join(homedir(), ".claude", "commands");
  commands.push(...readCommandDir(globalDir, "global"));

  // Project-local commands
  if (projectDir) {
    const localDir = join(projectDir, ".claude", "commands");
    commands.push(...readCommandDir(localDir, "project"));
  }

  // Sort alphabetically
  commands.sort((a, b) => a.name.localeCompare(b.name));
  return commands;
}

function readCommandDir(
  dir: string,
  source: "global" | "project",
): SlashCommand[] {
  try {
    const files = readdirSync(dir).filter((f) => f.endsWith(".md"));
    return files.map((f) => {
      const name = f.replace(/\.md$/, "");
      const description = extractDescription(join(dir, f));
      return { name, description, source };
    });
  } catch {
    return [];
  }
}

function extractDescription(filePath: string): string {
  try {
    const content = readFileSync(filePath, "utf8");
    const lines = content.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      // Strip markdown heading markers
      const stripped = trimmed.replace(/^#+\s*/, "");
      if (stripped) return stripped;
    }
    return "";
  } catch {
    return "";
  }
}
