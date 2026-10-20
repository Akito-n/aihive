import { render } from "ink-testing-library";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setLocale } from "../../lib/i18n.js";
import { filterLogs, LogView, logKind } from "../LogView.js";

const tick = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => setLocale("en"));
afterEach(() => setLocale("ja"));

// ─── logKind ─────────────────────────────────────────────────────────

describe("logKind", () => {
  it("classifies the lines App writes", () => {
    expect(logKind("10:00 [coordinator → worker-1] task: do it")).toBe(
      "message",
    );
    expect(logKind("10:00 → Worker 1: hello")).toBe("message");
    expect(logKind("10:00 ⚡ Worker 1: Code Review")).toBe("message");
    expect(logKind("10:00 [worker-1 → coordinator] error: tests broke")).toBe(
      "warning",
    );
    expect(logKind("10:00 Checks failed (npm test) for Worker 1 T1")).toBe(
      "warning",
    );
    expect(logKind("10:00 Task T1 stalled: no update for 15m")).toBe("warning");
    expect(logKind("10:00 Error stopping: boom")).toBe("warning");
    expect(logKind("10:00 Invalid memory-write payload from x")).toBe(
      "warning",
    );
    expect(logKind("10:00 Checks passed for Worker 1 T1")).toBe("task");
    expect(logKind("10:00 Completion report written: /p/r.md")).toBe("task");
    expect(logKind("10:00 Task T2 blocked by: T1")).toBe("task");
    expect(logKind("10:00 Workspace initialized")).toBe("other");
  });

  it("does not treat an agent's own words as a warning", () => {
    expect(
      logKind("10:00 [reviewer → coordinator] result: 2 tests failed before"),
    ).toBe("message");
  });

  it("filterLogs keeps everything for all", () => {
    const logs = ["10:00 Workspace initialized", "10:01 Error: x"];
    expect(filterLogs(logs, "all")).toEqual(logs);
    expect(filterLogs(logs, "warning")).toEqual(["10:01 Error: x"]);
  });
});

// ─── LogView ─────────────────────────────────────────────────────────

describe("LogView", () => {
  const logs = Array.from(
    { length: 30 },
    (_, i) => `10:${String(i).padStart(2, "0")} line ${i}`,
  );

  it("shows the newest lines first and scrolls back with k", async () => {
    const { lastFrame, stdin } = render(
      <LogView logs={logs} height={8} onClose={() => {}} />,
    );
    expect(lastFrame()).toContain("line 29");
    expect(lastFrame()).not.toContain("line 20");
    for (let i = 0; i < 9; i++) stdin.write("k");
    await tick();
    expect(lastFrame()).toContain("line 20");
    expect(lastFrame()).not.toContain("line 29");
    expect(lastFrame()).toContain("(9 lines above newest)");
    stdin.write("G");
    await tick();
    expect(lastFrame()).toContain("line 29");
    stdin.write("g");
    await tick();
    expect(lastFrame()).toContain("line 0");
  });

  it("stays scrolled up, not following, when new lines arrive", async () => {
    const { lastFrame, stdin, rerender } = render(
      <LogView logs={logs} height={8} onClose={() => {}} />,
    );
    stdin.write("k");
    await tick();
    rerender(
      <LogView
        logs={[...logs, "10:30 line 30"]}
        height={8}
        onClose={() => {}}
      />,
    );
    // Not following: the new line stays below the view until G
    expect(lastFrame()).not.toContain("line 30");
    stdin.write("G");
    await tick();
    expect(lastFrame()).toContain("line 30");
  });

  it("filters with f", async () => {
    const mixed = [
      "10:00 [coordinator → worker-1] task: build",
      "10:01 Checks passed for Worker 1 T1",
      "10:02 Error: boom",
    ];
    const { lastFrame, stdin } = render(
      <LogView logs={mixed} height={10} onClose={() => {}} />,
    );
    stdin.write("f"); // messages
    await tick();
    expect(lastFrame()).toContain("task: build");
    expect(lastFrame()).not.toContain("boom");
    stdin.write("f"); // tasks & checks
    await tick();
    expect(lastFrame()).toContain("Checks passed");
    expect(lastFrame()).not.toContain("task: build");
    stdin.write("f"); // warnings
    await tick();
    expect(lastFrame()).toContain("boom");
    expect(lastFrame()).not.toContain("Checks passed");
  });

  it("closes with Esc or L", async () => {
    const onClose = vi.fn();
    const { stdin } = render(<LogView logs={logs} onClose={onClose} />);
    stdin.write("L");
    await tick();
    stdin.write("\u001B");
    await tick();
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
