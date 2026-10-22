import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  claudeAgentDirs,
  claudeConfigPath,
  trustDirs,
  untrustedDirs,
} from "../claude-trust.js";
import type { AihiveConfig } from "../config.js";

// Every test works on a config file in a temp folder, never ~/.claude.json
let tmp: string;
let file: string;
let projA: string;
let projB: string;

beforeEach(() => {
  tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "trust-")));
  file = path.join(tmp, ".claude.json");
  projA = path.join(tmp, "a");
  projB = path.join(tmp, "b");
  fs.mkdirSync(projA);
  fs.mkdirSync(projB);
});

afterEach(() => {
  fs.rmSync(tmp, { recursive: true, force: true });
});

const read = () => JSON.parse(fs.readFileSync(file, "utf8"));

describe("claudeConfigPath", () => {
  it("is ~/.claude.json, or inside CLAUDE_CONFIG_DIR when set", () => {
    expect(claudeConfigPath({}, "/home/me")).toBe("/home/me/.claude.json");
    expect(claudeConfigPath({ CLAUDE_CONFIG_DIR: "/cfg" }, "/home/me")).toBe(
      "/cfg/.claude.json",
    );
  });
});

describe("untrustedDirs", () => {
  it("lists every folder when Claude has no config yet", () => {
    expect(untrustedDirs([projA, projB], file)).toEqual([projA, projB]);
  });

  it("leaves out folders already trusted", () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        projects: { [projA]: { hasTrustDialogAccepted: true } },
      }),
    );
    expect(untrustedDirs([projA, projB], file)).toEqual([projB]);
  });

  it("asks nothing when the config cannot be read", () => {
    fs.writeFileSync(file, "{ broken");
    expect(untrustedDirs([projA], file)).toEqual([]);
  });
});

describe("trustDirs", () => {
  it("marks the folders trusted and keeps everything else", () => {
    fs.writeFileSync(
      file,
      JSON.stringify({
        numStartups: 3,
        projects: { [projA]: { allowedTools: ["Bash"] } },
      }),
    );
    trustDirs([projA, projB], file);
    const config = read();
    expect(config.numStartups).toBe(3);
    expect(config.projects[projA]).toEqual({
      allowedTools: ["Bash"],
      hasTrustDialogAccepted: true,
    });
    expect(config.projects[projB]).toEqual({ hasTrustDialogAccepted: true });
    expect(untrustedDirs([projA, projB], file)).toEqual([]);
  });

  it("creates the config when there is none", () => {
    trustDirs([projA], file);
    expect(read().projects[projA].hasTrustDialogAccepted).toBe(true);
  });

  it("never overwrites a config it cannot parse", () => {
    fs.writeFileSync(file, "{ broken");
    expect(() => trustDirs([projA], file)).toThrow();
    expect(fs.readFileSync(file, "utf8")).toBe("{ broken");
  });

  it("records a folder by its real path, as Claude does", () => {
    const link = path.join(tmp, "link");
    fs.symlinkSync(projA, link);
    trustDirs([link], file);
    expect(Object.keys(read().projects)).toEqual([projA]);
  });

  it("leaves no temp file behind", () => {
    trustDirs([projA], file);
    expect(fs.readdirSync(tmp).sort()).toEqual([".claude.json", "a", "b"]);
  });
});

describe("claudeAgentDirs", () => {
  it("takes each Claude agent's folder once, skipping other CLIs", () => {
    const config: AihiveConfig = {
      session: "s",
      agents: [
        { name: "Orchestrator", role: "orchestrator", window: "o" },
        { name: "Coordinator", role: "coordinator", window: "c" },
        { name: "Worker 1", role: "worker", window: "w", cli: "claude" },
        { name: "Worker 2", role: "worker", window: "w", cli: "codex" },
      ],
    };
    const workspaces = new Map([
      ["Worker 1", { cwd: projB, addDirs: [] }],
      ["Worker 2", { cwd: path.join(tmp, "c"), addDirs: [] }],
    ]);
    expect(claudeAgentDirs(config, workspaces, projA)).toEqual([projA, projB]);
  });
});
