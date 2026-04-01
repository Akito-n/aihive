import fs from "node:fs";
import path from "node:path";

export interface TaskStatus {
  taskId?: string;
  status?: string;
  subtaskId?: number;
  assignedTo?: string;
  result?: string;
  errorDetail?: string;
}

/** Watch queue/tasks/ directory for YAML changes and call back on each change */
export function watchTaskFiles(
  projectDir: string,
  onChange: (filename: string, content: TaskStatus) => void,
): () => void {
  const tasksDir = path.join(projectDir, "queue", "tasks");

  if (!fs.existsSync(tasksDir)) {
    fs.mkdirSync(tasksDir, { recursive: true });
  }

  const watcher = fs.watch(tasksDir, (_event, filename) => {
    if (!filename || !filename.endsWith(".yaml")) return;

    try {
      const filePath = path.join(tasksDir, filename);
      const raw = fs.readFileSync(filePath, "utf8").trim();
      if (!raw) return;

      // Simple YAML key-value parser (no dependency needed)
      const parsed: TaskStatus = {};
      for (const line of raw.split("\n")) {
        const match = line.match(/^(\w+):\s*"?([^"]*)"?\s*$/);
        if (match) {
          const [, key, value] = match;
          (parsed as Record<string, string>)[key] = value;
        }
      }
      onChange(filename, parsed);
    } catch {
      // File may be mid-write, ignore
    }
  });

  return () => watcher.close();
}

/** Watch the orchestrator-to-coordinator queue file */
export function watchOrchestratorQueue(
  projectDir: string,
  onChange: (content: string) => void,
): () => void {
  const filePath = path.join(
    projectDir,
    "queue",
    "orchestrator_to_coordinator.yaml",
  );

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, "");
  }

  const watcher = fs.watch(filePath, () => {
    try {
      const content = fs.readFileSync(filePath, "utf8").trim();
      if (content) onChange(content);
    } catch {
      // ignore
    }
  });

  return () => watcher.close();
}
