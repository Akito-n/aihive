import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  LEGACY_BUNDLED_HASHES,
  MANIFEST_FILE,
  syncInstructions,
} from "../instructions.js";

const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");

describe("syncInstructions", () => {
  let tmpDir: string;
  let bundledDir: string;
  let userDir: string;

  const writeBundled = (file: string, content: string) =>
    fs.writeFileSync(path.join(bundledDir, file), content);
  const writeUser = (file: string, content: string) =>
    fs.writeFileSync(path.join(userDir, file), content);
  const readUser = (file: string) =>
    fs.readFileSync(path.join(userDir, file), "utf8");
  const readManifest = () =>
    JSON.parse(fs.readFileSync(path.join(userDir, MANIFEST_FILE), "utf8"));

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-instr-"));
    bundledDir = path.join(tmpDir, "bundled");
    userDir = path.join(tmpDir, "user");
    fs.mkdirSync(bundledDir);
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("installs missing files and records their hashes", () => {
    writeBundled("worker.md", "v1");
    writeBundled("notes.txt", "ignored");

    const result = syncInstructions(bundledDir, userDir);

    expect(result).toEqual({ installed: ["worker.md"], updated: [], kept: [] });
    expect(readUser("worker.md")).toBe("v1");
    expect(fs.existsSync(path.join(userDir, "notes.txt"))).toBe(false);
    expect(readManifest()).toEqual({ "worker.md": sha256("v1") });
  });

  it("replaces an unedited copy with the new bundled version", () => {
    writeBundled("worker.md", "v1");
    syncInstructions(bundledDir, userDir);

    writeBundled("worker.md", "v2");
    const result = syncInstructions(bundledDir, userDir);

    expect(result.updated).toEqual(["worker.md"]);
    expect(readUser("worker.md")).toBe("v2");
    expect(readManifest()["worker.md"]).toBe(sha256("v2"));
  });

  it("keeps an edited copy and does not move its recorded hash", () => {
    writeBundled("worker.md", "v1");
    syncInstructions(bundledDir, userDir);
    writeUser("worker.md", "v1 + my edits");

    writeBundled("worker.md", "v2");
    const result = syncInstructions(bundledDir, userDir);

    expect(result.kept).toEqual(["worker.md"]);
    expect(readUser("worker.md")).toBe("v1 + my edits");
    expect(readManifest()["worker.md"]).toBe(sha256("v1"));
  });

  it("does nothing when the copy already matches the bundled version", () => {
    writeBundled("worker.md", "v1");
    syncInstructions(bundledDir, userDir);

    const result = syncInstructions(bundledDir, userDir);

    expect(result).toEqual({ installed: [], updated: [], kept: [] });
  });

  it("upgrades a pre-manifest copy that matches a legacy bundled hash", () => {
    // A copy installed by v0.3.0 or earlier: no manifest yet.
    fs.mkdirSync(userDir);
    const oldContent = "legacy content";
    LEGACY_BUNDLED_HASHES["legacy.md"] = [sha256(oldContent)];
    try {
      writeUser("legacy.md", oldContent);
      writeUser("edited.md", "something the user wrote");
      writeBundled("legacy.md", "new");
      writeBundled("edited.md", "new");

      const result = syncInstructions(bundledDir, userDir);

      expect(result.updated).toEqual(["legacy.md"]);
      expect(result.kept).toEqual(["edited.md"]);
      expect(readUser("legacy.md")).toBe("new");
    } finally {
      delete LEGACY_BUNDLED_HASHES["legacy.md"];
    }
  });

  it("treats a corrupt manifest as empty", () => {
    fs.mkdirSync(userDir);
    fs.writeFileSync(path.join(userDir, MANIFEST_FILE), "{not json");
    writeUser("worker.md", "unknown");
    writeBundled("worker.md", "v2");

    const result = syncInstructions(bundledDir, userDir);

    expect(result.kept).toEqual(["worker.md"]);
    expect(readManifest()).toEqual({});
  });
});

describe("LEGACY_BUNDLED_HASHES", () => {
  it("covers every bundled instruction file", () => {
    const bundled = fs
      .readdirSync(
        path.join(import.meta.dirname, "..", "..", "..", "instructions"),
      )
      .filter((f) => f.endsWith(".md"));
    expect(Object.keys(LEGACY_BUNDLED_HASHES).sort()).toEqual(bundled.sort());
  });
});

describe("bundled English instructions", () => {
  const dir = path.join(import.meta.dirname, "..", "..", "..", "instructions");
  const mdFiles = (d: string) =>
    fs
      .readdirSync(d)
      .filter((f) => f.endsWith(".md"))
      .sort();

  it("has an English version of every Japanese instruction file", () => {
    expect(mdFiles(path.join(dir, "en"))).toEqual(mdFiles(dir));
  });

  it("keeps the same rule IDs and message types as the Japanese version", () => {
    const tokens = (text: string) =>
      [
        ...text.matchAll(
          /\bF\d{3}\b|`(?:task|result|error|consult|advice|skill-proposal|memory-write|memory-read|check-result)`/g,
        ),
      ]
        .map((m) => m[0])
        .sort();
    for (const file of mdFiles(dir)) {
      const ja = fs.readFileSync(path.join(dir, file), "utf8");
      const en = fs.readFileSync(path.join(dir, "en", file), "utf8");
      expect(new Set(tokens(en)), file).toEqual(new Set(tokens(ja)));
    }
  });
});
