import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import {
  CommandInput,
  isNewlineKey,
  moveVertically,
  splitLines,
} from "../CommandInput.js";

const tick = () => new Promise((r) => setTimeout(r, 30));
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

const key = (overrides: Record<string, boolean> = {}) =>
  ({
    return: false,
    ctrl: false,
    shift: false,
    meta: false,
    ...overrides,
  }) as unknown as Parameters<typeof isNewlineKey>[1];

describe("isNewlineKey", () => {
  it("takes Ctrl+Enter, Shift+Enter and Option+Enter as a new line", () => {
    expect(isNewlineKey("", key({ return: true, ctrl: true }))).toBe(true);
    expect(isNewlineKey("", key({ return: true, shift: true }))).toBe(true);
    expect(isNewlineKey("", key({ return: true, meta: true }))).toBe(true);
  });

  it("takes a bare linefeed (Ctrl+J) as a new line", () => {
    expect(isNewlineKey("\n", key())).toBe(true);
  });

  it("leaves plain Enter for sending", () => {
    expect(isNewlineKey("", key({ return: true }))).toBe(false);
  });
});

describe("splitLines / moveVertically", () => {
  it("splits with each line's start", () => {
    expect(splitLines("ab\n\ncd")).toEqual([
      { text: "ab", start: 0 },
      { text: "", start: 3 },
      { text: "cd", start: 4 },
    ]);
  });

  it("keeps the column when moving between lines, as far as the line allows", () => {
    const text = "abcd\nxy\nあいう";
    expect(moveVertically(text, 3, 1)).toBe(7);
    expect(moveVertically(text, 6, 1)).toBe(8);
    expect(moveVertically(text, 10, -1)).toBe(7);
    expect(moveVertically(text, 2, -1)).toBeUndefined();
    expect(moveVertically(text, 9, 1)).toBeUndefined();
  });
});

describe("CommandInput lines", () => {
  const setup = () => {
    const onSubmit = vi.fn();
    const result = render(
      <CommandInput
        targetLabel="Orchestrator"
        onSubmit={onSubmit}
        onCancel={() => {}}
        onPromptKeys={() => {}}
        promptInfo={{ detected: false, options: [] }}
        slashCommands={[]}
      />,
    );
    return { ...result, onSubmit };
  };

  it("adds a line with Ctrl+Enter and sends every line with Enter", async () => {
    const { stdin, lastFrame, onSubmit } = setup();
    stdin.write("first");
    await tick();
    // Ctrl+Enter in the kitty keyboard protocol
    stdin.write("\u001b[13;5u");
    await tick();
    stdin.write("second");
    await tick();

    const frame = stripAnsi(lastFrame() ?? "");
    expect(frame).toMatch(/first\s*│\n.*second/);
    expect(onSubmit).not.toHaveBeenCalled();

    stdin.write("\r");
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("first\nsecond");
  });

  it("adds a line with Option+Enter", async () => {
    const { stdin, onSubmit } = setup();
    stdin.write("a");
    await tick();
    stdin.write("\u001b\r");
    await tick();
    stdin.write("b");
    await tick();
    stdin.write("\r");
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("a\nb");
  });

  it("moves up a line with the arrow key and types there", async () => {
    const { stdin, onSubmit } = setup();
    stdin.write("ab");
    await tick();
    stdin.write("\n");
    await tick();
    stdin.write("cd");
    await tick();
    stdin.write("\u001b[A");
    await tick();
    stdin.write("X");
    await tick();
    stdin.write("\r");
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("abX\ncd");
  });
});
