import React from "react";
import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OverviewMode } from "../OverviewMode.js";
import type { AgentInfo } from "../../lib/tmux.js";

const mockCapturePane = vi.hoisted(() => vi.fn());
vi.mock("../../lib/tmux.js", () => ({ capturePane: mockCapturePane }));

function makeAgent(name: string, paneTarget: string, role = "worker"): AgentInfo {
  return { name, role, status: "running", paneTarget };
}

// ─── paneWidth 計算（純粋ロジック） ─────────────────────────────────────────

describe("paneWidth 計算", () => {
  // OverviewMode 内の実装: Math.max(30, Math.floor((columns - 4) / 3) - 2)
  const computePaneWidth = (cols: number) =>
    Math.max(30, Math.floor((cols - 4) / 3) - 2);

  it("Math.max(30, floor((columns - 4) / 3) - 2) が正しい", () => {
    expect(computePaneWidth(120)).toBe(36); // floor(116/3)-2 = 38-2 = 36
    expect(computePaneWidth(80)).toBe(30);  // floor(76/3)-2 = 25-2 = 23 → max(30,23)=30
    expect(computePaneWidth(100)).toBe(30); // floor(96/3)-2 = 32-2 = 30 → max(30,30)=30
    expect(computePaneWidth(200)).toBe(63); // floor(196/3)-2 = 65-2 = 63
  });

  it("columns が小さい場合は最小値 30 を保持する", () => {
    expect(computePaneWidth(50)).toBe(30);
    expect(computePaneWidth(10)).toBe(30);
  });
});

// ─── ROLE_COLOR フォールバック（純粋ロジック） ───────────────────────────────

describe("ROLE_COLOR フォールバック", () => {
  const ROLE_COLOR: Record<string, string> = {
    orchestrator: "magenta",
    coordinator: "blue",
    worker: "yellow",
    reviewer: "green",
    scout: "cyan",
  };

  it("既知の role は正しい色を返す", () => {
    expect(ROLE_COLOR["orchestrator"] ?? "white").toBe("magenta");
    expect(ROLE_COLOR["coordinator"] ?? "white").toBe("blue");
    expect(ROLE_COLOR["worker"] ?? "white").toBe("yellow");
    expect(ROLE_COLOR["reviewer"] ?? "white").toBe("green");
    expect(ROLE_COLOR["scout"] ?? "white").toBe("cyan");
  });

  it("未知の role は 'white' にフォールバックする", () => {
    expect(ROLE_COLOR["unknown-role"] ?? "white").toBe("white");
    expect(ROLE_COLOR["custom"] ?? "white").toBe("white");
    expect(ROLE_COLOR[""] ?? "white").toBe("white");
  });
});

// ─── 行グループ化ロジック（純粋ロジック） ────────────────────────────────────

describe("行グループ化ロジック (COLS=3)", () => {
  const COLS = 3;
  const groupIntoRows = <T,>(items: T[]): T[][] => {
    const rows: T[][] = [];
    for (let i = 0; i < items.length; i += COLS) {
      rows.push(items.slice(i, i + COLS));
    }
    return rows;
  };

  it("3件以下のとき 1 行", () => {
    expect(groupIntoRows([1, 2, 3])).toHaveLength(1);
    expect(groupIntoRows([1, 2])).toHaveLength(1);
    expect(groupIntoRows([1])).toHaveLength(1);
  });

  it("4件のとき 2 行（1行目3件、2行目1件）", () => {
    const rows = groupIntoRows([1, 2, 3, 4]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(1);
  });

  it("6件のとき 2 行（各3件）", () => {
    const rows = groupIntoRows([1, 2, 3, 4, 5, 6]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveLength(3);
    expect(rows[1]).toHaveLength(3);
  });

  it("7件のとき 3 行", () => {
    expect(groupIntoRows([1, 2, 3, 4, 5, 6, 7])).toHaveLength(3);
  });
});

// ─── OverviewMode コンポーネント統合テスト ────────────────────────────────

describe("OverviewMode (integration)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCapturePane.mockReturnValue("");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("capturePane が各エージェントに対して呼ばれる", () => {
    const agents = [
      makeAgent("agent-1", "p1"),
      makeAgent("agent-2", "p2"),
    ];
    render(<OverviewMode sessionName="test-session" agents={agents} />);

    expect(mockCapturePane).toHaveBeenCalledWith("test-session", "p1", 12);
    expect(mockCapturePane).toHaveBeenCalledWith("test-session", "p2", 12);
  });

  it("refreshMs 間隔で capturePane を定期呼び出しする", () => {
    const agents = [makeAgent("a1", "p1"), makeAgent("a2", "p2")];
    render(<OverviewMode sessionName="s" agents={agents} refreshMs={1000} />);

    expect(mockCapturePane).toHaveBeenCalledTimes(2); // initial: 2 agents
    vi.advanceTimersByTime(2000);
    expect(mockCapturePane).toHaveBeenCalledTimes(6); // 2 agents × 3 calls (initial + 2 intervals)
  });

  it("ヘッダーに agent 数が表示される", () => {
    const agents = [makeAgent("a1", "p1"), makeAgent("a2", "p2")];
    const { lastFrame } = render(
      <OverviewMode sessionName="s" agents={agents} />,
    );
    expect(lastFrame()).toContain("2 agents");
  });
});
