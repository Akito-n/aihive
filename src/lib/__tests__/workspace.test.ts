import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { AihiveConfig } from "../config.js";
import { initWorkspace } from "../workspace.js";

const config = {
  session: "test",
  agents: [{ name: "Worker 1", role: "worker" }],
} as unknown as AihiveConfig;

describe("initWorkspace", () => {
  let tmpDir: string;
  let cwdSpy: ReturnType<typeof vi.spyOn>;
  const inboxFile = () =>
    path.join(tmpDir, ".aihive", "mailbox", "worker-1", "inbox", "m1.yaml");

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-ws-"));
    cwdSpy = vi.spyOn(process, "cwd").mockReturnValue(tmpDir);
    initWorkspace(config);
    fs.writeFileSync(inboxFile(), "id: m1\n");
  });

  afterEach(() => {
    cwdSpy.mockRestore();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("clears existing mailbox contents by default", () => {
    initWorkspace(config);
    expect(fs.existsSync(inboxFile())).toBe(false);
  });

  it("does not create the removed status/dashboard.md", () => {
    expect(fs.existsSync(path.join(tmpDir, ".aihive", "status"))).toBe(false);
  });

  it("keeps existing mailbox contents with reset: false", () => {
    initWorkspace(config, { reset: false });
    expect(fs.existsSync(inboxFile())).toBe(true);
  });
});
