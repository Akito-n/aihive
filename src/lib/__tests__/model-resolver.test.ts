import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  modelName,
  modelOptionLabel,
  onResolvedModelsChange,
  parseInitModel,
  prettyModelId,
  refreshResolvedModels,
  setResolvedModels,
} from "../model-resolver.js";

beforeEach(() => {
  setResolvedModels({});
  vi.spyOn(fs, "mkdirSync").mockReturnValue(undefined);
  vi.spyOn(fs, "writeFileSync").mockReturnValue(undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("prettyModelId", () => {
  it("formats Claude model IDs", () => {
    expect(prettyModelId("claude-opus-5-5")).toBe("Opus 5.5");
    expect(prettyModelId("claude-fable-5-1")).toBe("Fable 5.1");
    expect(prettyModelId("claude-haiku-4-5-20251001")).toBe("Haiku 4.5");
  });

  it("leaves other IDs alone", () => {
    expect(prettyModelId("gpt-5.5")).toBe("gpt-5.5");
  });
});

describe("parseInitModel", () => {
  it("reads the model from the init event", () => {
    const line = JSON.stringify({
      type: "system",
      subtype: "init",
      model: "claude-opus-5-5",
    });
    expect(parseInitModel(line)).toBe("claude-opus-5-5");
  });

  it("ignores other events, bad JSON, and unsafe IDs", () => {
    expect(parseInitModel('{"type":"active_goal"}')).toBeUndefined();
    expect(parseInitModel("not json")).toBeUndefined();
    expect(
      parseInitModel(
        JSON.stringify({
          type: "system",
          subtype: "init",
          model: "a\u001b[2J",
        }),
      ),
    ).toBeUndefined();
  });
});

describe("model labels", () => {
  it("shows the raw alias until it is resolved", () => {
    expect(modelName("claude", "opus")).toBe("opus");
    expect(modelOptionLabel("claude", "opus")).toBe("opus");
  });

  it("adds the version once resolved", () => {
    setResolvedModels({ opus: "claude-opus-5-5" });
    expect(modelName("claude", "opus")).toBe("Opus 5.5");
    expect(modelName(undefined, "opus")).toBe("Opus 5.5");
    expect(modelOptionLabel("claude", "opus")).toBe("opus (Opus 5.5)");
  });

  it("does not touch other CLIs", () => {
    setResolvedModels({ opus: "claude-opus-5-5" });
    expect(modelName("codex", "opus")).toBe("opus");
  });
});

describe("refreshResolvedModels", () => {
  it("stores resolved aliases, keeps old ones on failure, and notifies", async () => {
    setResolvedModels({ haiku: "claude-haiku-5-5" });
    const listener = vi.fn();
    const off = onResolvedModelsChange(listener);
    const changed = await refreshResolvedModels(["opus", "haiku"], async (a) =>
      a === "opus" ? "claude-opus-5-5" : undefined,
    );
    off();
    expect(changed).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(modelName("claude", "opus")).toBe("Opus 5.5");
    expect(modelName("claude", "haiku")).toBe("Haiku 5.5");
    expect(fs.writeFileSync).toHaveBeenCalledTimes(1);
  });

  it("does not rewrite the cache when nothing changed", async () => {
    setResolvedModels({ opus: "claude-opus-5-5" });
    const changed = await refreshResolvedModels(
      ["opus"],
      async () => "claude-opus-5-5",
    );
    expect(changed).toBe(false);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });
});
