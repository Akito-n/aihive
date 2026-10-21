import type { DOMElement } from "ink";
import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";

const setCursorPosition = vi.fn();

vi.mock("ink", async (importOriginal) => ({
  ...(await importOriginal<typeof import("ink")>()),
  useCursor: () => ({ setCursorPosition }),
}));

const { CommandInput, outputPosition } = await import("../CommandInput.js");

const tick = () => new Promise((r) => setTimeout(r, 20));

function node(left: number, top: number, parentNode?: DOMElement): DOMElement {
  return {
    yogaNode: { getComputedLeft: () => left, getComputedTop: () => top },
    parentNode,
  } as unknown as DOMElement;
}

describe("outputPosition", () => {
  it("adds up the offsets of the element and its parents", () => {
    const root = node(0, 0);
    const box = node(2, 5, root);
    expect(outputPosition(node(3, 1, box))).toEqual({ x: 5, y: 6 });
  });

  it("is undefined before the element is laid out", () => {
    expect(outputPosition(null)).toBeUndefined();
    expect(
      outputPosition({ parentNode: undefined } as unknown as DOMElement),
    ).toBeUndefined();
  });
});

describe("CommandInput cursor", () => {
  it("puts the terminal cursor after the typed text, inside the input line", async () => {
    const { stdin, rerender } = render(
      <CommandInput
        targetLabel="Orchestrator"
        onSubmit={() => {}}
        onCancel={() => {}}
        onPromptKeys={() => {}}
        promptInfo={{ detected: false, options: [] }}
        slashCommands={[]}
      />,
    );
    await tick();
    // Re-render once laid out, as the cursor blink does
    stdin.write("a");
    await tick();
    stdin.write("\u007F");
    await tick();
    const empty = setCursorPosition.mock.lastCall?.[0];
    expect(empty).toBeDefined();
    expect(empty.y).toBeGreaterThan(0);

    stdin.write("今回");
    await tick();
    rerender(
      <CommandInput
        targetLabel="Orchestrator"
        onSubmit={() => {}}
        onCancel={() => {}}
        onPromptKeys={() => {}}
        promptInfo={{ detected: false, options: [] }}
        slashCommands={[]}
      />,
    );
    await tick();
    const typed = setCursorPosition.mock.lastCall?.[0];
    expect(typed).toEqual({ x: empty.x + 4, y: empty.y });
  });
});
