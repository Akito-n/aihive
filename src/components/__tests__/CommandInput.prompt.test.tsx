import { render } from "ink-testing-library";
import { describe, expect, it, vi } from "vitest";
import { CommandInput } from "../CommandInput.js";
import type { PromptInfo } from "../PaneView.js";

const tick = () => new Promise((r) => setTimeout(r, 20));

function setup(
  promptInfo: PromptInfo = { detected: true, options: [], trust: true },
) {
  const onPromptKeys = vi.fn();
  const onSubmit = vi.fn();
  const view = render(
    <CommandInput
      targetLabel="Orchestrator"
      onSubmit={onSubmit}
      onCancel={() => {}}
      onPromptKeys={onPromptKeys}
      promptInfo={promptInfo}
      slashCommands={[]}
    />,
  );
  return { ...view, onPromptKeys, onSubmit };
}

describe("CommandInput with a choice menu in the pane", () => {
  it("answers the trust check with Down then Enter, never an extra Enter", async () => {
    const { stdin, onPromptKeys } = setup();
    await tick();
    stdin.write("\u001B[B"); // Down
    await tick();
    stdin.write("\r");
    await tick();
    expect(onPromptKeys.mock.calls).toEqual([[["Down"]], [["Enter"]]]);
  });

  it("sends a digit on its own", async () => {
    const { stdin, onPromptKeys } = setup({ detected: true, options: [] });
    await tick();
    stdin.write("1");
    await tick();
    expect(onPromptKeys.mock.calls).toEqual([[["1"]]]);
  });

  it("shows how to get past the trust check", async () => {
    const { lastFrame } = setup();
    await tick();
    expect(lastFrame()).toContain("Yes, I trust this folder");
  });

  it("types normally once the input has text", async () => {
    const { stdin, onPromptKeys, onSubmit } = setup();
    await tick();
    stdin.write("h");
    await tick();
    stdin.write("1");
    await tick();
    stdin.write("\r");
    await tick();
    expect(onPromptKeys).not.toHaveBeenCalled();
    expect(onSubmit).toHaveBeenCalledWith("h1");
  });

  it("leaves the keys to the input when no menu is shown", async () => {
    const { stdin, onPromptKeys } = setup({ detected: false, options: [] });
    await tick();
    stdin.write("\r");
    await tick();
    expect(onPromptKeys).not.toHaveBeenCalled();
  });
});
