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
import { Dashboard } from "../Dashboard.js";
import { HelpBar, retroCommands } from "../HelpBar.js";
import { partySummary } from "../MainMenu.js";
import { PaneView } from "../PaneView.js";
import { PixelLogo, pixelLines } from "../PixelLogo.js";
import { StartupScreen, startupSteps } from "../StartupScreen.js";
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

  it("shows each member's lasting level", () => {
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent(), makeAgent({ name: "Worker 2" })]}
        selectedIndex={0}
        levels={{ "Worker 1": 7 }}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("せんし Lv7");
    expect(frame).toContain("せんし Lv1");
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
  it("shows the latest message above the commands", () => {
    const { lastFrame } = render(
      <HelpBar
        state="running"
        message={{ text: "せんしは けっかを ほうこくした。" }}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(" コマンド ");
    expect(frame).toContain("＊「せんしは けっかを ほうこくした。");
    expect(frame).toContain("はなす Enter");
    expect(frame).toContain("にげる x");
    expect(frame.split("\n")).toHaveLength(4);
  });

  it("keeps its height without a message", () => {
    const { lastFrame } = render(<HelpBar state="running" />);
    expect((lastFrame() ?? "").split("\n")).toHaveLength(4);
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

describe("pixel logo", () => {
  it("draws each glyph pixel as two full blocks, seven rows tall", () => {
    const lines = pixelLines("hi");
    expect(lines).toHaveLength(7);
    expect(lines[0]).toBe("██      ██  ██████");
    expect(lines[3]).toBe("██████████    ██");
  });

  it("refuses letters it has no glyph for", () => {
    expect(() => pixelLines("aihivez")).toThrow();
  });

  it("fits the title in an 80-column terminal", () => {
    const { lastFrame } = render(<PixelLogo />);
    const widths = (lastFrame() ?? "").split("\n").map((l) => l.length);
    expect(Math.max(...widths)).toBeLessThanOrEqual(70);
  });
});

describe("retro startup", () => {
  it("gathers the party as it starts", async () => {
    expect(startupSteps()[2]).toBe("おうさまが なかまに くわわった！");
    setTheme("classic");
    expect(startupSteps()[2]).toBe("Spawning Orchestrator...");
    setTheme("retro");
    const { lastFrame } = render(<StartupScreen onComplete={() => {}} />);
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(lastFrame()).toContain("██");
    expect(lastFrame()).toContain("ぼうけんの じゅんびを している…");
  });
});
