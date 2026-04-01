import { readdirSync, readFileSync, writeFileSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

export interface QuickCommand {
  name: string;
  category: string;
  description: string;
  prompt: string;
}

export interface QuickCommandCategory {
  name: string;
  commands: QuickCommand[];
}

export function loadQuickCommands(projectDir: string): QuickCommand[] {
  const dir = join(projectDir, ".aihive", "commands");
  const commands: QuickCommand[] = [];

  let files: string[];
  try {
    files = readdirSync(dir).filter(
      (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
    );
  } catch {
    return commands;
  }

  for (const file of files) {
    try {
      const raw = readFileSync(join(dir, file), "utf8");
      const data = parseYaml(raw);
      if (data && typeof data === "object" && data.name && data.prompt) {
        commands.push({
          name: data.name,
          category: data.category ?? "general",
          description: data.description ?? "",
          prompt: data.prompt,
        });
      }
    } catch {
      // skip invalid files
    }
  }

  commands.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
  return commands;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

export function saveQuickCommand(projectDir: string, cmd: QuickCommand): void {
  const dir = join(projectDir, ".aihive", "commands");
  mkdirSync(dir, { recursive: true });
  const filename = `${toSlug(cmd.name)}.yml`;
  const data = {
    name: cmd.name,
    category: cmd.category,
    description: cmd.description,
    prompt: cmd.prompt,
  };
  writeFileSync(join(dir, filename), stringifyYaml(data), "utf8");
}

export function deleteQuickCommand(projectDir: string, name: string): void {
  const dir = join(projectDir, ".aihive", "commands");
  const filename = `${toSlug(name)}.yml`;
  try {
    unlinkSync(join(dir, filename));
  } catch {
    // file may not exist
  }
}

export function groupByCategory(commands: QuickCommand[]): QuickCommandCategory[] {
  const map = new Map<string, QuickCommand[]>();
  for (const cmd of commands) {
    const list = map.get(cmd.category) ?? [];
    list.push(cmd);
    map.set(cmd.category, list);
  }
  return Array.from(map.entries()).map(([name, cmds]) => ({
    name,
    commands: cmds,
  }));
}
