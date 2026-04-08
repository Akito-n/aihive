import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => {
  const m = {
    readdirSync: vi.fn().mockReturnValue([]),
    readFileSync: vi.fn().mockReturnValue(""),
  };
  return { default: m, ...m };
});

vi.mock("node:os", () => ({
  homedir: vi.fn(() => "/mock/home"),
  default: { homedir: vi.fn(() => "/mock/home") },
}));

import { readdirSync, readFileSync } from "node:fs";
import { loadSlashCommands } from "../commands.js";

beforeEach(() => {
  vi.mocked(readdirSync).mockReturnValue([]);
  vi.mocked(readFileSync).mockReturnValue("");
});

// ─── loadSlashCommands() ──────────────────────────────────────────────

describe("loadSlashCommands()", () => {
  it("returns [] when both directories are missing (readdirSync throws)", () => {
    vi.mocked(readdirSync).mockImplementation(() => {
      throw new Error("ENOENT");
    });
    expect(loadSlashCommands("/project")).toEqual([]);
  });

  it("loads commands from the global directory", () => {
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).includes("home")) return ["global-cmd.md"] as never;
      throw new Error("ENOENT");
    });
    vi.mocked(readFileSync).mockReturnValue("# Global Command");

    const result = loadSlashCommands("/project");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("global-cmd");
    expect(result[0].source).toBe("global");
  });

  it("loads commands from the project directory", () => {
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).includes("project")) return ["local-cmd.md"] as never;
      throw new Error("ENOENT");
    });
    vi.mocked(readFileSync).mockReturnValue("## Local Command");

    const result = loadSlashCommands("/project");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("local-cmd");
    expect(result[0].source).toBe("project");
  });

  it("loads from both global and project dirs combined", () => {
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).includes("home")) return ["global-cmd.md"] as never;
      return ["local-cmd.md"] as never;
    });
    vi.mocked(readFileSync).mockReturnValue("# Heading");

    const result = loadSlashCommands("/project");
    expect(result).toHaveLength(2);
    const sources = result.map((c) => c.source);
    expect(sources).toContain("global");
    expect(sources).toContain("project");
  });

  it("skips non-.md files", () => {
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).includes("home"))
        return ["cmd.md", "readme.txt", "config.yaml"] as never;
      throw new Error("ENOENT");
    });
    vi.mocked(readFileSync).mockReturnValue("# Description");

    const result = loadSlashCommands("/project");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("cmd");
  });

  it("sorts commands alphabetically by name", () => {
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).includes("home"))
        return ["z-cmd.md", "a-cmd.md"] as never;
      throw new Error("ENOENT");
    });
    vi.mocked(readFileSync).mockReturnValue("# Heading");

    const result = loadSlashCommands("/project");
    expect(result[0].name).toBe("a-cmd");
    expect(result[1].name).toBe("z-cmd");
  });

  it("returns [] when no projectDir is given and global is empty", () => {
    vi.mocked(readdirSync).mockReturnValue([]);
    expect(loadSlashCommands()).toEqual([]);
  });
});

// ─── extractDescription() (tested indirectly) ────────────────────────

describe("extractDescription (via loadSlashCommands)", () => {
  function setup(content: string) {
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).includes("home")) return ["cmd.md"] as never;
      throw new Error("ENOENT");
    });
    vi.mocked(readFileSync).mockReturnValue(content as never);
    return loadSlashCommands("/project")[0];
  }

  it("strips '# ' from a level-1 heading", () => {
    const cmd = setup("# My Command");
    expect(cmd.description).toBe("My Command");
  });

  it("strips '## ' from a level-2 heading", () => {
    const cmd = setup("## My Command");
    expect(cmd.description).toBe("My Command");
  });

  it("returns plain text line as-is (no heading to strip)", () => {
    const cmd = setup("Just a description");
    expect(cmd.description).toBe("Just a description");
  });

  it("skips leading empty lines and returns the first non-empty line", () => {
    const cmd = setup("\n\n# Real Title\nmore text");
    expect(cmd.description).toBe("Real Title");
  });

  it("returns empty string for empty file", () => {
    const cmd = setup("");
    expect(cmd.description).toBe("");
  });

  it("returns empty string when readFileSync throws", () => {
    vi.mocked(readdirSync).mockImplementation((p) => {
      if (String(p).includes("home")) return ["cmd.md"] as never;
      throw new Error("ENOENT");
    });
    vi.mocked(readFileSync).mockImplementation(() => {
      throw new Error("EACCES");
    });
    const result = loadSlashCommands("/project");
    expect(result[0].description).toBe("");
  });
});
