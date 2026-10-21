import { Box } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it } from "vitest";
import { CommandInput, displayWidth, layoutLine } from "../CommandInput.js";

const tick = () => new Promise((r) => setTimeout(r, 30));
const stripAnsi = (s: string) => s.replace(/\u001b\[[0-9;]*m/g, "");

function shownWidth(view: ReturnType<typeof layoutLine>): number {
  return (
    (view.scrollOffset > 0 ? 1 : 0) +
    displayWidth(view.before + view.cursorChar + view.after)
  );
}

describe("layoutLine", () => {
  it("shows short text as is", () => {
    const view = layoutLine("hello", 5, 0, 20);
    expect(view).toMatchObject({
      scrollOffset: 0,
      before: "hello",
      cursorChar: " ",
      after: "",
    });
  });

  it("never takes more columns than given, for any cursor in wide text", () => {
    const text =
      "録を行ってdisabledになる仕組みがあると思いますが、slackの打刻（途中で）";
    for (const width of [5, 10, 11, 20, 33]) {
      let offset = 0;
      for (let cursor = 0; cursor <= text.length; cursor++) {
        const view = layoutLine(text, cursor, offset, width);
        offset = view.scrollOffset;
        expect(shownWidth(view)).toBeLessThanOrEqual(width);
        expect(text.slice(view.skipChars, cursor)).toBe(view.before);
      }
    }
  });

  it("scrolls back when the cursor moves left of the view", () => {
    const view = layoutLine("あいうえおかきくけこ", 1, 12, 8);
    expect(view.scrollOffset).toBe(2);
    expect(view.before).toBe("");
    expect(view.cursorChar).toBe("い");
  });
});

describe("CommandInput wrapping", () => {
  it("keeps long Japanese text on one line inside the screen padding", async () => {
    const { stdin, lastFrame, rerender } = render(
      <Box padding={1}>
        <CommandInput
          targetLabel="Orchestrator"
          onSubmit={() => {}}
          onCancel={() => {}}
          onQuickKey={() => {}}
          promptInfo={{ detected: false, options: [] }}
          slashCommands={[]}
        />
      </Box>,
    );
    await tick();
    // Type in small chunks, slower than paste detection
    const text =
      "録を行ってdisabledになる仕組みがあると思いますが、slackの打刻の場合、たまに実際には失敗（途中でブラウザが落ちてたりなど）しても成功扱いになってしまいます。";
    for (let i = 0; i < text.length; i += 10) {
      stdin.write(text.slice(i, i + 10));
      await new Promise((r) => setTimeout(r, 80));
    }
    rerender(
      <Box padding={1}>
        <CommandInput
          targetLabel="Orchestrator"
          onSubmit={() => {}}
          onCancel={() => {}}
          onQuickKey={() => {}}
          promptInfo={{ detected: false, options: [] }}
          slashCommands={[]}
        />
      </Box>,
    );
    await tick();
    const lines = stripAnsi(lastFrame() ?? "").split("\n");
    const textLines = lines.filter((l) => l.includes("しまいます"));
    expect(textLines).toHaveLength(1);
    const [line] = textLines;
    expect(line.trimEnd().endsWith("│")).toBe(true);
    // Scrolled: the "…" marker and the end of the text stay in view
    expect(line).toContain("…");
    expect(line).toMatch(/しまいます。\s+│/);
    expect(displayWidth(line)).toBeLessThanOrEqual(100);
    for (const l of lines) expect(displayWidth(l)).toBeLessThanOrEqual(100);
  });
});
