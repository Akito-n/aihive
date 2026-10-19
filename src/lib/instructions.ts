import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

// ─── Types ───────────────────────────────────────────────────────────

export interface InstructionSyncResult {
  installed: string[]; // newly copied (file did not exist)
  updated: string[]; // unedited copy replaced with the new bundled version
  kept: string[]; // user-edited copy left untouched
}

/** Records the hash of the bundled version each user copy was installed from */
export const MANIFEST_FILE = ".bundled.json";

/**
 * Hashes of bundled instructions shipped before the manifest existed
 * (up to v0.3.0). A user copy matching one of these was never edited.
 */
export const LEGACY_BUNDLED_HASHES: Record<string, string[]> = {
  "coordinator.md": [
    "c08b53e6089dff7e659761246bccf10359fe305e95ca2bea5669004a7b1e9e25",
  ],
  "orchestrator.md": [
    "63686354a88f73f7fa17799d54ae4277663c5374a1225f01674e661db0ad3499",
  ],
  "reviewer.md": [
    "c33513825d96029cf53e47050d50e194bf7f04ab494122b7625e6db8cb37b76f",
  ],
  "scout.md": [
    "e082bb2ce4437c71439d265d7f5882baccb92b5cc54de69070ec8072422476ce",
  ],
  "worker.md": [
    "8f337a09c7d9feb1bc437d050be30e43be2367fb7c9e2ed998fcbd7a274daea9",
  ],
};

// ─── Sync ────────────────────────────────────────────────────────────

/**
 * Copy bundled instructions into the user directory. Copies the user never
 * edited are replaced with newer bundled versions; edited copies are kept.
 */
export function syncInstructions(
  bundledDir: string,
  userDir: string,
): InstructionSyncResult {
  const result: InstructionSyncResult = {
    installed: [],
    updated: [],
    kept: [],
  };
  fs.mkdirSync(userDir, { recursive: true });
  if (!fs.existsSync(bundledDir)) return result;

  const manifest = readManifest(userDir);

  for (const file of fs.readdirSync(bundledDir).sort()) {
    if (!file.endsWith(".md")) continue;
    const bundled = fs.readFileSync(path.join(bundledDir, file));
    const bundledHash = sha256(bundled);
    const dst = path.join(userDir, file);

    if (!fs.existsSync(dst)) {
      fs.writeFileSync(dst, bundled);
      manifest[file] = bundledHash;
      result.installed.push(file);
      continue;
    }

    const currentHash = sha256(fs.readFileSync(dst));
    if (currentHash === bundledHash) {
      manifest[file] = bundledHash;
      continue;
    }

    const knownHashes = [
      ...(manifest[file] ? [manifest[file]] : []),
      ...(LEGACY_BUNDLED_HASHES[file] ?? []),
    ];
    if (knownHashes.includes(currentHash)) {
      fs.writeFileSync(dst, bundled);
      manifest[file] = bundledHash;
      result.updated.push(file);
    } else {
      result.kept.push(file);
    }
  }

  fs.writeFileSync(
    path.join(userDir, MANIFEST_FILE),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return result;
}

// ─── Helpers ─────────────────────────────────────────────────────────

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

function readManifest(userDir: string): Record<string, string> {
  try {
    const raw = fs.readFileSync(path.join(userDir, MANIFEST_FILE), "utf8");
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : {};
  } catch {
    return {};
  }
}
