import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Text } from "ink";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../lib/i18n.js";
import { emptyProgress } from "../../lib/progress.js";
import type { Task } from "../../lib/tasks.js";
import {
  cursorGlyph,
  frameStyle,
  gaugeFill,
  getTheme,
  logoColors,
  setLook,
  setTheme,
} from "../../lib/theme.js";
import type { AgentInfo } from "../../lib/tmux.js";
import {
  cellWidth,
  Dashboard,
  fitLeftColumn,
  memberStateOf,
  PartyHud,
} from "../Dashboard.js";
import { EquipView, lookSummary } from "../EquipView.js";
import { HelpBar, retroCommands } from "../HelpBar.js";
import { partySummary } from "../MainMenu.js";
import { PaneView } from "../PaneView.js";
import { PixelLogo, pixelLines } from "../PixelLogo.js";
import { ShopView } from "../ShopView.js";
import { StartupScreen, startupSteps } from "../StartupScreen.js";
import { StatusView } from "../StatusView.js";
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

  it("puts a badge on the top border and a footer on the bottom one", () => {
    const { lastFrame } = render(
      <Window title="ようす" badge={<Text>B3F</Text>} footer={<Text>⚔1</Text>}>
        <Text>body</Text>
      </Window>,
    );
    const lines = (lastFrame() ?? "").split("\n");
    expect(lines[0]).toMatch(/ ようす ─+ B3F ─╮$/);
    expect(lines[lines.length - 1]).toMatch(/⚔1─╯$/);
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
    expect(frame).toMatch(/せんし\s+Lv1/);
    expect(frame).toMatch(/designer\s+Lv1/);
    expect(frame).toContain("·たいき");
    expect(frame).toContain("✗こんらん");
  });

  it("shows members without a task as waiting, not fighting", () => {
    // Every agent is "running" once the session starts, with or without work
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent(), makeAgent({ name: "Worker 2" })]}
        selectedIndex={0}
        tasks={[makeTask()]}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).not.toContain("たたかい中");
    expect(frame).toMatch(/Worker 1\s+せんし\s+Lv1 ⚔T1/);
    expect(frame).toMatch(/Worker 2\s+せんし\s+Lv1 ·たいき/);
    expect(frame).toMatch(/└ .+ build the log screen/);
  });

  it("marks a member reviewing a task", () => {
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent()]}
        selectedIndex={0}
        tasks={[makeTask({ state: "review" })]}
      />,
    );
    expect(lastFrame()).toContain("✚T1");
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
    expect(frame).toContain("☠T1");
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
    expect(frame).toMatch(/せんし\s+Lv7/);
    expect(frame).toMatch(/せんし\s+Lv1/);
  });

  it("shows one tab under the party, the quests first", () => {
    const { lastFrame } = render(
      <Dashboard agents={[makeAgent()]} selectedIndex={0} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("[クエスト]");
    expect(frame).toContain(" ぼうけん ");
    expect(frame).toContain("Tab");
    expect(frame).toContain("まだ クエストは ない");
    expect(frame).not.toContain("ふくろは");
  });

  it("keeps skills and memory in the bag tab", () => {
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent()]}
        selectedIndex={0}
        tab="bag"
        skillCounts={{ approved: 2, proposed: 1, rejected: 0 }}
        memoryCount={4}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("[ふくろ]");
    expect(frame).toContain("承認済み 2");
    expect(frame).toContain("4 件");
  });

  it("tells the adventure in its tab, newest first", () => {
    const { lastFrame } = render(
      <Dashboard
        agents={[makeAgent()]}
        selectedIndex={0}
        tab="adventure"
        floor={3}
        gold={120}
        journal={[
          { id: 2, text: "スライムを たおした！" },
          { id: 1, text: "なかまが そろった。" },
        ]}
      />,
    );
    const lines = (lastFrame() ?? "").split("\n");
    const at = (text: string) => lines.findIndex((l) => l.includes(text));
    expect(at("ちか3かい 120G")).toBeGreaterThan(-1);
    expect(at("スライムを たおした")).toBeLessThan(at("なかまが そろった"));
  });

  it("fits its height: the party always, the tab only when it has room", () => {
    const agents = [makeAgent(), makeAgent({ name: "Worker 2" })];
    const tall = render(
      <Dashboard agents={agents} selectedIndex={0} height={12} />,
    );
    const tallFrame = tall.lastFrame() ?? "";
    expect(tallFrame.split("\n").length).toBeLessThanOrEqual(12);
    expect(tallFrame).toContain("[クエスト]");

    const short = render(
      <Dashboard agents={agents} selectedIndex={0} height={6} />,
    );
    const shortFrame = short.lastFrame() ?? "";
    expect(shortFrame).toContain("Worker 2");
    expect(shortFrame).not.toContain("[クエスト]");
  });

  it("keeps the selected member in view when the party does not fit", () => {
    const agents = ["A", "B", "C", "D", "E"].map((name) => makeAgent({ name }));
    const { lastFrame } = render(
      <Dashboard agents={agents} selectedIndex={4} height={5} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toMatch(/E\s+せんし/);
    expect(frame).not.toMatch(/A\s+せんし/);
  });

  it("measures wide characters as two columns", () => {
    expect(cellWidth("Lv1")).toBe(3);
    expect(cellWidth("せんし")).toBe(6);
  });

  it("drops the task lines before the tab when space is short", () => {
    expect(fitLeftColumn(undefined, 7, 3).details).toBe(true);
    // 7 members take 9 rows; 3 task lines and a 4-row tab need 16
    expect(fitLeftColumn(16, 7, 3)).toEqual({ details: true, tabLines: 1 });
    expect(fitLeftColumn(15, 7, 3)).toEqual({ details: false, tabLines: 3 });
    expect(fitLeftColumn(12, 7, 0)).toEqual({ details: false, tabLines: 0 });
  });

  it("sums up the party and the quests for a border", () => {
    const agents = [
      makeAgent(),
      makeAgent({ name: "Worker 2" }),
      makeAgent({ name: "Worker 3" }),
    ];
    const tasks = [
      makeTask(),
      makeTask({ id: "T2", assignedTo: "worker-2", state: "review" }),
      makeTask({ id: "T3", assignedTo: "worker-3", state: "done" }),
    ];
    const { lastFrame } = render(
      <PartyHud agents={agents} tasks={tasks} stalledIds={[]} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("⚔1");
    expect(frame).toContain("✚1");
    expect(frame).toContain("·1");
    expect(frame).toContain("1/3");
  });

  it("names a member's state from its task", () => {
    const agent = makeAgent();
    expect(memberStateOf(agent, undefined, false).kind).toBe("idle");
    expect(memberStateOf(agent, makeTask(), false).text).toBe("⚔T1");
    expect(memberStateOf(agent, makeTask(), true).kind).toBe("stalled");
    expect(
      memberStateOf(makeAgent({ status: "error" }), makeTask(), false).kind,
    ).toBe("error");
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
      <ThemeScreen onBack={onBack} file={file} unlocked={["gameboy"]} />,
    );
    expect(lastFrame()).toContain("レトロRPG");
    expect(lastFrame()).toContain("500G・みせで かえる");
    await tick();
    stdin.write("\u001B[B"); // the locked fantasy theme can't be chosen
    await tick();
    stdin.write("\r");
    await tick();
    expect(onBack).not.toHaveBeenCalled();
    stdin.write("\u001B[B"); // the bought game boy theme
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

describe("StatusView", () => {
  beforeEach(() => setLocale("ja"));

  it("shows the dungeon floor and each member's skills", () => {
    const progress = emptyProgress();
    progress.adventure = {
      floor: 4,
      deepest: 6,
      points: 12,
      wins: 5,
      losses: 1,
    };
    progress.members["worker-1"] = {
      name: "Worker 1",
      role: "worker",
      xp: 40,
      tasksDone: 2,
      skills: { str: 16, vit: 4, agi: 0, int: 0 },
    };
    const { lastFrame } = render(
      <StatusView
        progress={progress}
        members={[{ name: "Worker 1", role: "worker" }]}
      />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("いま ちか4かい");
    expect(frame).toContain("さいしん ちか6かい");
    expect(frame).toContain("つぎのかいまで 12/36");
    expect(frame).toContain("ちから 3");
    expect(frame).toContain("たいりょく 2");
    expect(frame).toContain("まだ ない。スキルを つかうと おぼえる。");
  });

  it("lists the most used special moves", () => {
    const progress = emptyProgress();
    progress.moves = { review: 12, deploy: 1 };
    const { lastFrame } = render(
      <StatusView progress={progress} members={[]} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain(" ひっさつわざ ");
    expect(frame).toMatch(/review\s+★3\s+12かい/);
    expect(frame.indexOf("review")).toBeLessThan(frame.indexOf("deploy"));
  });
});

describe("gear looks", () => {
  afterEach(() => setLook({}));

  it("changes the frame, cursor, gauge and logo while worn", () => {
    setTheme("retro");
    expect(frameStyle().borderColor).toBe("white");
    expect(cursorGlyph()).toBe("▶");
    setLook({ frame: "red", cursor: "★", gauge: "▓", logo: ["red"] });
    expect(frameStyle().borderColor).toBe("red");
    expect(cursorGlyph()).toBe("★");
    expect(gaugeFill()).toBe("▓");
    expect(logoColors()).toEqual(["red"]);
    setTheme("classic");
    expect(frameStyle(true).borderColor).toBe("cyan");
    expect(cursorGlyph()).toBe("▶");
    setTheme("retro");
  });
});

describe("EquipView", () => {
  beforeEach(() => setLocale("ja"));

  const sword = {
    id: "s1",
    base: "ironSword",
    rarity: "rare" as const,
    affixes: ["crimson"],
    power: 6,
  };
  const ring = {
    id: "r1",
    base: "ring",
    rarity: "common" as const,
    affixes: [],
    power: 1,
  };

  it("shows the worn slots and the bag, newest first", () => {
    const progress = emptyProgress();
    progress.bag = [sword, ring];
    progress.equipped = { weapon: "s1" };
    const { lastFrame } = render(<EquipView progress={progress} />);
    const frame = lastFrame() ?? "";
    expect(frame).toContain(" そうび ");
    expect(frame).toContain("べにいろの てつのつるぎ +6");
    expect(frame).toContain("ふくろ 2/50");
    expect(frame.indexOf("いしのゆびわ")).toBeLessThan(
      frame.lastIndexOf("べにいろの てつのつるぎ"),
    );
    expect(lookSummary(sword)).toBe("わくの いろ");
  });

  it("equips the selected item and toggles the look", async () => {
    const progress = emptyProgress();
    progress.bag = [sword, ring];
    const onEquip = vi.fn();
    const onToggleLooks = vi.fn();
    const { stdin } = render(
      <EquipView
        progress={progress}
        onEquip={onEquip}
        onToggleLooks={onToggleLooks}
        onClose={() => {}}
      />,
    );
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("j");
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    expect(onEquip).toHaveBeenCalledWith("s1");
    stdin.write("v");
    await new Promise((r) => setTimeout(r, 20));
    expect(onToggleLooks).toHaveBeenCalled();
  });

  it("says when the bag is empty", () => {
    const { lastFrame } = render(<EquipView progress={emptyProgress()} />);
    expect(lastFrame()).toContain("ふくろは からっぽだ。");
  });
});

describe("quest monsters and titles", () => {
  beforeEach(() => setLocale("ja"));

  it("shows each quest's monster and a boss's HP", () => {
    setTheme("retro");
    const base = {
      description: "",
      assignedTo: "worker-1",
      state: "running" as const,
      blockedBy: [],
      createdAt: "2026-10-20T00:00:00Z",
      updatedAt: "2026-10-20T00:00:00Z",
    };
    const tasks = [
      { ...base, id: "T1", description: "Fix the crash" },
      { ...base, id: "T1-1", state: "done" as const },
      { ...base, id: "T1-2" },
    ];
    const { lastFrame } = render(
      <Dashboard agents={[makeAgent()]} selectedIndex={0} tasks={tasks} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("バグスライム");
    expect(frame).toContain("1/2");
  });

  it("lists the earned titles on the status screen", () => {
    const progress = emptyProgress();
    progress.titles = ["firstQuest", "bossSlayer"];
    const { lastFrame } = render(
      <StatusView progress={progress} members={[]} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("しょうごう 2/10");
    expect(frame).toContain("「かけだしの ぼうけんしゃ」");
    expect(frame).toContain("パーティ Lv1");
    expect(frame).toContain("「ボスごろし」");
  });
});

describe("shop", () => {
  beforeEach(() => setLocale("ja"));

  it("sells themes for gold and tells what came of it", async () => {
    const progress = { ...emptyProgress(), gold: 520, unlocked: ["gameboy"] };
    const onBuy = vi.fn().mockReturnValueOnce(true).mockReturnValue(false);
    const { stdin, lastFrame } = render(
      <ShopView progress={progress} onBuy={onBuy} onClose={() => {}} />,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("ゴールド 520G");
    expect(frame).toMatch(/ファンタジー.*500G/);
    expect(frame).toMatch(/ゲームボーイ.*かった/);
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    expect(onBuy).toHaveBeenCalledWith("ff", 500);
    expect(lastFrame()).toContain("を かった！");
    stdin.write("j");
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("\r");
    await new Promise((r) => setTimeout(r, 20));
    expect(onBuy).toHaveBeenCalledTimes(1);
  });

  it("draws the bought themes in their own colors", () => {
    setTheme("ff");
    expect(frameStyle()).toEqual({
      borderStyle: "double",
      borderColor: "blueBright",
    });
    expect(logoColors()?.[0]).toBe("whiteBright");
    setTheme("gameboy");
    expect(frameStyle().borderColor).toBe("green");
    setLook({ frame: "red" });
    expect(frameStyle().borderColor).toBe("red");
    setLook({});
    setTheme("retro");
  });

  it("sells the selected unworn item from the equipment screen", async () => {
    const progress = emptyProgress();
    progress.bag = [
      { id: "a", base: "ring", rarity: "common", affixes: [], power: 1 },
      { id: "b", base: "stick", rarity: "common", affixes: [], power: 1 },
    ];
    progress.equipped = { weapon: "b" };
    const onSell = vi.fn();
    const { stdin } = render(
      <EquipView progress={progress} onSell={onSell} onClose={() => {}} />,
    );
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("s"); // the newest, b, is worn
    await new Promise((r) => setTimeout(r, 20));
    expect(onSell).not.toHaveBeenCalled();
    stdin.write("j");
    await new Promise((r) => setTimeout(r, 20));
    stdin.write("s");
    await new Promise((r) => setTimeout(r, 20));
    expect(onSell).toHaveBeenCalledWith("a");
  });
});
