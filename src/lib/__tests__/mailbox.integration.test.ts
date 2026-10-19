import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { type Message, MessageBus, SYSTEM_MAILBOX } from "../mailbox.js";
import { MemoryManager, normalizeMemoryEntry } from "../memory.js";

// Uses the real filesystem (no fs mock) to exercise watch + poll behaviour.

function makeMsg(id: string): Message {
  return {
    id,
    from: "Worker 1",
    to: "Orchestrator",
    type: "result",
    payload: `payload ${id}`,
    timestamp: "2026-01-01T00:00:00Z",
  };
}

describe("MessageBus (real filesystem)", () => {
  let tmpDir: string;
  let bus: MessageBus;
  const agents = ["Orchestrator", "Worker 1"];
  const inbox = () =>
    path.join(tmpDir, ".aihive", "mailbox", "orchestrator", "inbox");
  const poll = () =>
    (bus as unknown as { pollInboxes: () => void }).pollInboxes();

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-mb-"));
    bus = new MessageBus(tmpDir);
    bus.init(agents);
  });

  afterEach(() => {
    bus.stopWatching();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("ignores messages that existed before watching started (reattach)", () => {
    fs.writeFileSync(path.join(inbox(), "old.yaml"), stringify(makeMsg("old")));
    const handler = vi.fn();
    bus.onMessage(handler);
    bus.startWatching(agents);

    poll();
    expect(handler).not.toHaveBeenCalled();
  });

  it("delivers a message whose file was empty when first seen", () => {
    const handler = vi.fn();
    bus.onMessage(handler);
    bus.startWatching(agents);

    const file = path.join(inbox(), "late.yaml");
    fs.writeFileSync(file, "");
    poll();
    expect(handler).not.toHaveBeenCalled();

    fs.writeFileSync(file, stringify(makeMsg("late")));
    poll();
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({ id: "late" });

    // Already delivered: further polls do not repeat it
    poll();
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it("send() delivers to the recipient inbox and is picked up once", () => {
    const handler = vi.fn();
    bus.onMessage(handler);
    bus.startWatching(agents);

    bus.send("Worker 1", "Orchestrator", "result", "done");
    poll();
    poll();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler.mock.calls[0][0]).toMatchObject({
      from: "Worker 1",
      to: "Orchestrator",
      payload: "done",
    });
  });

  it("only the unsubscribed handler stops receiving messages", () => {
    const kept = vi.fn();
    const removed = vi.fn();
    bus.onMessage(kept);
    const unsubscribe = bus.onMessage(removed);
    bus.startWatching(agents);
    unsubscribe();

    fs.writeFileSync(path.join(inbox(), "m.yaml"), stringify(makeMsg("m")));
    poll();

    expect(kept).toHaveBeenCalledTimes(1);
    expect(removed).not.toHaveBeenCalled();
  });

  it("delivers messages sent to the system mailbox, as the instructions describe", () => {
    // Same shape as the memory-write example in instructions/worker.md
    const memory = new MemoryManager(tmpDir);
    memory.init(["worker-1", "worker-2"]);
    bus.onMessage((msg) => {
      if (msg.type !== "memory-write") return;
      const entry = normalizeMemoryEntry(JSON.parse(msg.payload), msg.from);
      if (entry) memory.write(entry);
    });
    bus.startWatching(agents);

    const systemInbox = path.join(
      tmpDir,
      ".aihive",
      "mailbox",
      SYSTEM_MAILBOX,
      "inbox",
    );
    fs.writeFileSync(
      path.join(systemInbox, "memory-write-001.yaml"),
      [
        'id: "memory-write-001"',
        'from: "worker-1"',
        'to: "system"',
        'type: "memory-write"',
        "payload: |",
        '  {"id": "mem-1", "key": "build", "value": "npm run build", "tags": ["shared"]}',
        'timestamp: "2024-01-01T12:00:00Z"',
      ].join("\n"),
    );
    poll();

    expect(memory.search("build", "worker-2").map((e) => e.id)).toEqual([
      "mem-1",
    ]);
  });

  it("clear() also empties the system mailbox", () => {
    const systemInbox = path.join(
      tmpDir,
      ".aihive",
      "mailbox",
      SYSTEM_MAILBOX,
      "inbox",
    );
    fs.writeFileSync(path.join(systemInbox, "old.yaml"), "id: old\n");
    bus.clear(agents);
    expect(fs.readdirSync(systemInbox)).toEqual([]);
  });
});
