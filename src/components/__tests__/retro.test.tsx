import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../lib/i18n.js";
import type { Task } from "../../lib/tasks.js";
import { getTheme, setTheme } from "../../lib/theme.js";
import type { AgentInfo } from "../../lib/tmux.js";
import { Dashboard, levelOf } from "../Dashboard.js";
import { HelpBar, retroCommands } from "../HelpBar.js";
import { partySummary } from "../MainMenu.js";
import { PaneView } from "../PaneView.js";
import { ThemeScreen } from "../ThemeScreen.js";
import { Window } from "../Window.js";

vi.mock("../../lib/tmux.js", () => ({ capturePane: () => "hello" }));

function makeAgent(overrides: Partial<AgentInfo> = {}): AgentInfo {
  return {
    name: "Worker 1",
    role: "worker",
    status: "running",
    paneTarget: "workers.0",
    ...overrides,
  };
}

function makeTask(overrides: Partial<Task> = {}): Task {
  const now = new Date().toISOString();
  return {
    id: "T1",
    description: "build the log screen",
    assignedTo: "worker-1",
    state: "running",
    blockedBy: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

beforeEach(() => {
  setLocale("ja");
  setTheme("retro");
});
afterEach(() => setTheme("retro"));

describe("Window", () => {
  it("puts its title on the top border", () => {
    const { lastFrame } = render(
      <Window title="なかま">
        <Text>body</Text>
      </Window>,
    );
    const [top, middle] = (lastFrame() ?? "").split("\n");
    expect(top).toMatch(/^╭─+ なかま ─+╮$/);
    expect(middle).toContain("body");
  });
});

describe("retro dashboard", () => {
  it("lists the party with jobs, levels and conditions", () => {
    const agents = [
      makeAgent({ name: "Orchestrator", role: "orchestrator" }),
      makeAgent({ name: "Worker 1", status: "pending" }),
      makeAgent({ name: "Designer", role: "designer", status: "error" }),
    ];
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(" なかま ");
    expect(frame).toMatch(/▶Orchestrator\s+おうさま Lv1/);
    expect(frame).toContain("せんし Lv1");
    expect(frame).toContain("designer Lv1");
    expect(frame).toContain("たたかい中");
    expect(frame).toContain("たいき");
    expect(frame).toContain("こんらん");
  });

  it("shows a stalled agent as poisoned and counts it in the quests", () => {
    const task = makeTask();
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent()]}
        selectedIndex={0}
        tasks={[task]}
        stalledIds={[task.id]}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/どく T1/);
    expect(frame).toContain(" クエスト ");
    expect(frame).toContain("どく 1");
  });

  it("levels an agent up with each task it finished", () => {
    const tasks = [
      makeTask({ id: "T1", state: "done" }),
      makeTask({ id: "T2", state: "done" }),
      makeTask({ id: "T3", state: "running" }),
      makeTask({ id: "T4", state: "done", assignedTo: "worker-2" }),
    ];
    expect(levelOf(makeAgent(), tasks)).toBe(3);
  });

  it("keeps skills and memory in the bag", () => {
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent()]}
        selectedIndex={0}
        skillCounts={{ approved: 2, proposed: 1, rejected: 0 }}
        memoryCount={4}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(" ふくろ ");
    expect(frame).toContain("承認済み 2");
    expect(frame).toContain("4 件");
  });
});

describe("retro help bar", () => {
  it("shows the commands in a command window", () => {
    const { lastFrame } = render(<HelpBar state="running" />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain(" コマンド ");
    expect(frame).toContain("はなす Enter");
    expect(frame).toContain("にげる x");
    expect(frame.split("\n")).toHaveLength(3);
  });

  it("offers only start and quit when idle", () => {
    expect(retroCommands("idle").map(([key]) => key)).toEqual(["s", "q"]);
  });
});

describe("retro pane view", () => {
  it("names the window after the agent and keeps its height", async () => {
    const { lastFrame } = render(
      <PaneView
        sessionName="s"
        paneTarget="p"
        label="Worker 1"
        active
        lines={5}
      />,
    );
    await tick();
    const lines = (lastFrame() ?? "").split("\n");
    expect(lines[0]).toContain(" Worker 1 の ようす ");
    expect(lines).toHaveLength(9);
    expect(lastFrame()).toContain("hello");
  });
});

describe("theme screen", () => {
  it("switches the theme and saves it", async () => {
    const file = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "aihive-theme-")),
      "theme",
    );
    const onBack = vi.fn();
    const { stdin, lastFrame } = render(
      <ThemeScreen onBack={onBack} file={file} />,
    );
    expect(lastFrame()).toContain("レトロRPG");
    await tick();
    stdin.write("\u001B[B"); // down to classic
    await tick();
    stdin.write("\r");
    await tick();
    expect(getTheme()).toBe("classic");
    expect(fs.readFileSync(file, "utf8")).toBe("classic");
    expect(onBack).toHaveBeenCalled();
  });
});

describe("main menu party summary", () => {
  const roles = { orchestrator: 1, worker: 4, designer: 1 };

  it("names the party by job in the retro look", () => {
    expect(partySummary(6, roles, true)).toBe(
      "なかま: 6  おうさま 1  せんし 4  designer 1",
    );
  });

  it("keeps the classic summary", () => {
    expect(partySummary(6, roles, false)).toBe(
      "Agents: 6 (👑 1 orchestrator, 🔨 4 worker, ⬡ 1 designer)",
    );
  });
});
