import { describe, expect, it, vi } from "vitest";
import { notify } from "../notify.js";

describe("notify", () => {
  it("does nothing when off", () => {
    const bell = vi.fn();
    const run = vi.fn();
    notify("off", "aihive", "done", { bell, run, platform: "darwin" });
    expect(bell).not.toHaveBeenCalled();
    expect(run).not.toHaveBeenCalled();
  });

  it("only rings the bell by default", () => {
    const bell = vi.fn();
    const run = vi.fn();
    notify("bell", "aihive", "done", { bell, run, platform: "darwin" });
    expect(bell).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it("uses osascript on macOS with the text escaped", () => {
    const run = vi.fn();
    notify("desktop", "aihive", 'Task "T1" \\ failed\nnow', {
      bell: () => {},
      run,
      platform: "darwin",
    });
    expect(run).toHaveBeenCalledWith("osascript", [
      "-e",
      'display notification "Task \\"T1\\" \\\\ failed now" with title "aihive"',
    ]);
  });

  it("uses notify-send on Linux, passing the text as arguments", () => {
    const run = vi.fn();
    notify("desktop", "aihive", "$(rm -rf ~) -x", {
      bell: () => {},
      run,
      platform: "linux",
    });
    expect(run).toHaveBeenCalledWith("notify-send", [
      "--",
      "aihive",
      "$(rm -rf ~) -x",
    ]);
  });

  it("only rings the bell where there is no desktop notifier", () => {
    const bell = vi.fn();
    const run = vi.fn();
    notify("desktop", "aihive", "done", { bell, run, platform: "win32" });
    expect(bell).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });
});
