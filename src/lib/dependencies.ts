import { execSync } from "node:child_process";

export function checkDependencies(): void {
  // Check tmux — auto-install if missing
  if (!commandExists("tmux")) {
    console.log("tmux is not installed. Installing...");
    try {
      if (process.platform === "darwin") {
        execSync("brew install tmux", { stdio: "inherit" });
      } else {
        try {
          execSync("sudo apt-get install -y tmux", { stdio: "inherit" });
        } catch {
          execSync("sudo yum install -y tmux", { stdio: "inherit" });
        }
      }
      console.log("tmux installed successfully.");
    } catch {
      console.error("Failed to install tmux automatically.");
      if (process.platform === "darwin") {
        console.error("  Install manually: brew install tmux");
      } else {
        console.error("  Install manually: sudo apt install tmux");
      }
      process.exit(1);
    }
  }

  // Check claude
  if (!commandExists("claude")) {
    console.error("Error: claude (Claude Code CLI) is not installed.");
    console.error("  Install: npm install -g @anthropic-ai/claude-code");
    process.exit(1);
  }
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}
