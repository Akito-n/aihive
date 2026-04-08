import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";

vi.mock("node:fs", () => {
  const m = {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(""),
    readdirSync: vi.fn().mockReturnValue([]),
    unlinkSync: vi.fn(),
  };
  return { default: m, ...m };
});

import { mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import {
  deleteQuickCommand,
  groupByCategory,
  loadQuickCommands,
  saveQuickCommand,
} from "../quick-commands.js";
import type { QuickCommand } from "../quick-commands.js";

beforeEach(() => {
  vi.mocked(mkdirSync).mockClear();
  vi.mocked(writeFileSync).mockClear();
  vi.mocked(readFileSync).mockReturnValue("");
  vi.mocked(readdirSync).mockReturnValue([]);
  vi.mocked(unlinkSync).mockClear();
});

// ─── loadQuickCommands() ──────────────────────────────────────────────

describe("loadQuickCommands()", () => {
  it("returns [] when directory does not exist (readdirSync throws)", () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(loadQuickCommands("/project")).toEqual([]);
  });

  it("returns [] when directory is empty", () => {
    vi.mocked(readdirSync).mockReturnValue([]);
    expect(loadQuickCommands("/project")).toEqual([]);
  });

  it("parses a valid command file", () => {
    const data = { name: "my-cmd", category: "general", description: "desc", prompt: "do it" };
    vi.mocked(readdirSync).mockReturnValue(["my-cmd.yml"] as never);
    vi.mocked(readFileSync).mockReturnValue(stringify(data) as never);

    const result = loadQuickCommands("/project");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("my-cmd");
    expect(result[0].prompt).toBe("do it");
  });

  it("defaults category to 'general' when absent", () => {
    const data = { name: "cmd", prompt: "run" };
    vi.mocked(readdirSync).mockReturnValue(["cmd.yml"] as never);
    vi.mocked(readFileSync).mockReturnValue(stringify(data) as never);

    const result = loadQuickCommands("/project");
    expect(result[0].category).toBe("general");
  });

  it("skips files missing name field", () => {
    const data = { prompt: "do it" };
    vi.mocked(readdirSync).mockReturnValue(["cmd.yml"] as never);
    vi.mocked(readFileSync).mockReturnValue(stringify(data) as never);

    expect(loadQuickCommands("/project")).toHaveLength(0);
  });

  it("skips files missing prompt field", () => {
    const data = { name: "cmd" };
    vi.mocked(readdirSync).mockReturnValue(["cmd.yml"] as never);
    vi.mocked(readFileSync).mockReturnValue(stringify(data) as never);

    expect(loadQuickCommands("/project")).toHaveLength(0);
  });

  it("skips malformed yaml files without throwing", () => {
    vi.mocked(readdirSync).mockReturnValue(["bad.yml"] as never);
    vi.mocked(readFileSync).mockReturnValue("{ invalid: [yaml" as never);

    expect(() => loadQuickCommands("/project")).not.toThrow();
    expect(loadQuickCommands("/project")).toHaveLength(0);
  });

  it("sorts by category then name", () => {
    const files = ["z-cmd.yml", "a-cmd.yml", "b-cmd.yml"];
    const contents = [
      stringify({ name: "z-cmd", category: "beta", prompt: "p1" }),
      stringify({ name: "a-cmd", category: "alpha", prompt: "p2" }),
      stringify({ name: "b-cmd", category: "alpha", prompt: "p3" }),
    ];

    vi.mocked(readdirSync).mockReturnValue(files as never);
    let callCount = 0;
    vi.mocked(readFileSync).mockImplementation(() => contents[callCount++] as never);

    const result = loadQuickCommands("/project");
    // alpha/a-cmd → alpha/b-cmd → beta/z-cmd
    expect(result[0].name).toBe("a-cmd");
    expect(result[1].name).toBe("b-cmd");
    expect(result[2].name).toBe("z-cmd");
  });
});

// ─── saveQuickCommand() ───────────────────────────────────────────────

describe("saveQuickCommand()", () => {
  it("calls mkdirSync and writeFileSync", () => {
    const cmd: QuickCommand = {
      name: "my command",
      category: "general",
      description: "desc",
      prompt: "do it",
    };
    saveQuickCommand("/project", cmd);
    expect(vi.mocked(mkdirSync)).toHaveBeenCalledOnce();
    expect(vi.mocked(writeFileSync)).toHaveBeenCalledOnce();
  });

  it("slugifies the name to build the filename (spaces → hyphens)", () => {
    const cmd: QuickCommand = { name: "My Command", category: "g", description: "", prompt: "p" };
    saveQuickCommand("/project", cmd);
    const [filePath] = vi.mocked(writeFileSync).mock.calls[0];
    expect(String(filePath)).toContain("my-command.yml");
  });

  it("strips special characters from filename", () => {
    const cmd: QuickCommand = { name: "Test (Special)!", category: "g", description: "", prompt: "p" };
    saveQuickCommand("/project", cmd);
    const [filePath] = vi.mocked(writeFileSync).mock.calls[0];
    // Only alphanumeric and hyphens remain
    expect(String(filePath)).toContain("test-special.yml");
  });
});

// ─── deleteQuickCommand() ─────────────────────────────────────────────

describe("deleteQuickCommand()", () => {
  it("calls unlinkSync with the slugified filename", () => {
    deleteQuickCommand("/project", "my command");
    expect(vi.mocked(unlinkSync)).toHaveBeenCalledOnce();
    const [filePath] = vi.mocked(unlinkSync).mock.calls[0];
    expect(String(filePath)).toContain("my-command.yml");
  });

  it("does not throw when file does not exist (unlinkSync throws)", () => {
    vi.mocked(unlinkSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(() => deleteQuickCommand("/project", "missing")).not.toThrow();
  });
});

// ─── groupByCategory() ───────────────────────────────────────────────

describe("groupByCategory()", () => {
  function cmd(name: string, category: string): QuickCommand {
    return { name, category, description: "", prompt: "" };
  }

  it("returns empty array for empty input", () => {
    expect(groupByCategory([])).toEqual([]);
  });

  it("groups commands by category", () => {
    const commands = [
      cmd("a", "alpha"),
      cmd("b", "beta"),
      cmd("c", "alpha"),
    ];
    const result = groupByCategory(commands);
    expect(result).toHaveLength(2);
    const alpha = result.find((g) => g.name === "alpha");
    expect(alpha?.commands).toHaveLength(2);
    expect(alpha?.commands.map((c) => c.name)).toEqual(["a", "c"]);
  });

  it("preserves all commands within each category", () => {
    const commands = [cmd("x", "cat"), cmd("y", "cat"), cmd("z", "cat")];
    const result = groupByCategory(commands);
    expect(result[0].commands).toHaveLength(3);
  });
});
