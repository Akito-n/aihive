import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
  getInstructionsPath: vi
    .fn()
    .mockReturnValue("/home/u/.aihive/instructions/worker.md"),
}));

import {
  buildAgentCommand,
  getCliModels,
  shellQuote,
} from "../cli-registry.js";

const worker = {
  name: "Worker 1",
  role: "worker",
  model: "sonnet",
  window: "workers",
};

describe("buildAgentCommand (claude)", () => {
  it("uses the role instructions without a workspace", () => {
    const cmd = buildAgentCommand(worker);
    expect(cmd).toContain(
      "--append-system-prompt-file /home/u/.aihive/instructions/worker.md",
    );
    expect(cmd).not.toContain("--add-dir");
  });

  it("uses the workspace prompt and extra directories", () => {
    const cmd = buildAgentCommand(worker, {
      cwd: "/wt/worker-1",
      addDirs: ["/my project"],
      promptFile: "/wt/prompts/worker-1.md",
    });
    expect(cmd).toContain("--add-dir '/my project'");
    expect(cmd).toContain(
      "--append-system-prompt-file /wt/prompts/worker-1.md",
    );
    expect(cmd).not.toContain("instructions/worker.md");
  });
});

describe("buildAgentCommand (codex / gemini)", () => {
  it("omits the model flag for 'default'", () => {
    expect(
      buildAgentCommand({ ...worker, cli: "codex", model: "default" }),
    ).not.toContain("model");
    expect(
      buildAgentCommand({ ...worker, cli: "gemini", model: "default" }),
    ).not.toContain("--model");
  });

  it("passes an explicit model", () => {
    expect(
      buildAgentCommand({ ...worker, cli: "codex", model: "gpt-5.5" }),
    ).toContain('-c model="gpt-5.5"');
    expect(
      buildAgentCommand({
        ...worker,
        cli: "gemini",
        model: "gemini-3.1-pro-preview",
      }),
    ).toContain("--model gemini-3.1-pro-preview");
  });

  it("lists 'default' first so new codex / gemini agents use the CLI's own pick", () => {
    expect(getCliModels("codex")[0]).toBe("default");
    expect(getCliModels("gemini")[0]).toBe("default");
  });
});

describe("shellQuote", () => {
  it("leaves plain paths alone", () => {
    expect(shellQuote("/home/u/.aihive/x-1.md")).toBe("/home/u/.aihive/x-1.md");
  });

  it("quotes spaces and single quotes", () => {
    expect(shellQuote("/a b/it's")).toBe("'/a b/it'\\''s'");
  });
});
