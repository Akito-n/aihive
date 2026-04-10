import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PaneView } from "../PaneView.js";

const mockCapturePane = vi.hoisted(() => vi.fn());
vi.mock("../../lib/tmux.js", () => ({ capturePane: mockCapturePane }));

describe("PaneView (integration)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockCapturePane.mockReturnValue("");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("初回レンダリング時に capturePane を呼ぶ", () => {
    render(
      <PaneView sessionName="s" paneTarget="p1" label="Agent" active={false} />,
    );
    expect(mockCapturePane).toHaveBeenCalledWith("s", "p1", 15);
  });

  it("refreshMs 間隔で capturePane を定期呼び出しする", () => {
    render(
      <PaneView
        sessionName="s"
        paneTarget="p1"
        label="Agent"
        active={false}
        refreshMs={1000}
      />,
    );
    expect(mockCapturePane).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(3000);
    // initial + 3 interval ticks
    expect(mockCapturePane).toHaveBeenCalledTimes(4);
  });

  it("出力が変化した場合に onPromptChange が新しい内容で呼ばれる", () => {
    const onPromptChange = vi.fn();
    // first call: no prompt, second call: prompt detected
    mockCapturePane
      .mockReturnValueOnce("plain text")
      .mockReturnValueOnce("Do you want to continue?");

    render(
      <PaneView
        sessionName="s"
        paneTarget="p1"
        label="Agent"
        active={false}
        refreshMs={1000}
        onPromptChange={onPromptChange}
      />,
    );

    // 初回: plain text は変化あり → onPromptChange 呼ばれる (detected: false)
    expect(onPromptChange).toHaveBeenCalledWith({
      detected: false,
      options: [],
    });

    vi.advanceTimersByTime(1000);

    // 2回目: "Do you want to continue?" → detected: true
    expect(onPromptChange).toHaveBeenLastCalledWith({
      detected: true,
      options: [],
    });
  });

  it("出力が安定した後は onPromptChange が追加で呼ばれない", () => {
    const onPromptChange = vi.fn();
    mockCapturePane.mockReturnValue("stable output");

    render(
      <PaneView
        sessionName="s"
        paneTarget="p1"
        label="Agent"
        active={false}
        refreshMs={1000}
        onPromptChange={onPromptChange}
      />,
    );

    // 安定化フェーズ（初期呼び出しを含む）
    vi.advanceTimersByTime(3000);
    const countAtSettle = onPromptChange.mock.calls.length;

    // 安定後はそれ以上増えない
    vi.advanceTimersByTime(5000);
    expect(onPromptChange.mock.calls.length).toBe(countAtSettle);
  });

  it("プロンプト検出時に onPromptChange が正しい情報で呼ばれる", () => {
    mockCapturePane.mockReturnValue("Continue? (y/n)");
    const onPromptChange = vi.fn();

    render(
      <PaneView
        sessionName="s"
        paneTarget="p1"
        label="Agent"
        active={false}
        onPromptChange={onPromptChange}
      />,
    );
    expect(onPromptChange).toHaveBeenCalledWith({
      detected: true,
      options: ["y", "n"],
    });
  });
});
