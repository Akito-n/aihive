import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import { setLocale } from "../i18n.js";

const mockFs = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true as boolean),
  readdirSync: vi.fn(() => [] as string[]),
  watch: vi.fn(() => ({ close: vi.fn() })),
  readFileSync: vi.fn(() => ""),
  renameSync: vi.fn(),
  rmSync: vi.fn(),
}));

const mockExecFileSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({ default: mockFs }));
vi.mock("node:child_process", () => ({ execFileSync: mockExecFileSync }));

import {
  archiveMessage,
  type Message,
  MessageBus,
  NUDGE_ATTEMPTS,
  SYSTEM_MAILBOX,
  toSlug,
} from "../mailbox.js";

describe("toSlug", () => {
  it("スペースをハイフンに変換し小文字化する", () => {
    expect(toSlug("Agent One")).toBe("agent-one");
  });

  it("すでに小文字でスペースなしの文字列はそのまま", () => {
    expect(toSlug("coordinator")).toBe("coordinator");
  });

  it("複数の連続スペースを1つのハイフンに変換する", () => {
    expect(toSlug("Worker  Two")).toBe("worker-two");
  });
});

describe("MessageBus", () => {
  let bus: MessageBus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(true);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.watch.mockReturnValue({ close: vi.fn() });
    bus = new MessageBus("/test-project");
  });

  describe("send()", () => {
    it("outboxとinboxにYAMLファイルを書き込み、Messageオブジェクトを返す", () => {
      const msg = bus.send("coordinator", "worker-1", "task", "do something");

      expect(msg).toMatchObject({
        from: "coordinator",
        to: "worker-1",
        type: "task",
        payload: "do something",
      });
      expect(msg.id).toBeDefined();
      expect(msg.timestamp).toBeDefined();

      const paths = mockFs.writeFileSync.mock.calls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("/coordinator/outbox/"))).toBe(true);
      expect(paths.some((p) => p.includes("/worker-1/inbox/"))).toBe(true);
    });

    it("outboxが存在しない場合はスキップしエラーを出さない", () => {
      mockFs.existsSync.mockImplementation(((p: unknown) => {
        return !(p as string).includes("outbox");
      }) as () => boolean);

      expect(() =>
        bus.send("coordinator", "worker-1", "task", "payload"),
      ).not.toThrow();
      const paths = mockFs.writeFileSync.mock.calls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("/coordinator/outbox/"))).toBe(false);
      expect(paths.some((p) => p.includes("/worker-1/inbox/"))).toBe(true);
    });
  });

  describe("processNewFile() partial writes", () => {
    it("空ファイルは処理済みにせず、書き込み完了後に処理する", () => {
      const handler = vi.fn();
      bus.onMessage(handler);
      const processNewFile = (
        bus as unknown as {
          processNewFile: (slug: string, file: string) => void;
        }
      ).processNewFile;
      mockFs.existsSync.mockReturnValue(true);

      mockFs.readFileSync.mockReturnValue("");
      processNewFile.call(bus, "worker-1", "p1.yaml");
      expect(handler).not.toHaveBeenCalled();

      const msg: Message = {
        id: "p1",
        from: "a",
        to: "b",
        type: "info",
        payload: "p",
        timestamp: "t",
      };
      mockFs.readFileSync.mockReturnValue(stringify(msg));
      processNewFile.call(bus, "worker-1", "p1.yaml");
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("onMessage()", () => {
    it("返された unsubscribe を呼ぶとハンドラが呼ばれなくなる", () => {
      const handler = vi.fn();
      const unsubscribe = bus.onMessage(handler);
      const msg: Message = {
        id: "u1",
        from: "a",
        to: "b",
        type: "info",
        payload: "p",
        timestamp: "t",
      };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(stringify(msg));
      const processNewFile = (
        bus as unknown as {
          processNewFile: (slug: string, file: string) => void;
        }
      ).processNewFile;

      processNewFile.call(bus, "worker-1", "u1.yaml");
      expect(handler).toHaveBeenCalledTimes(1);

      unsubscribe();
      processNewFile.call(bus, "worker-1", "u2.yaml");
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe("processNewFile()", () => {
    it("同一key（slug/filename）を二重処理しない（seen set）", () => {
      const handler = vi.fn();
      bus.onMessage(handler);

      const msg: Message = {
        id: "m1",
        from: "a",
        to: "b",
        type: "info",
        payload: "p",
        timestamp: "t",
      };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(stringify(msg));

      (bus as unknown as Record<string, Function>).processNewFile(
        "worker-1",
        "m1.yaml",
      );
      (bus as unknown as Record<string, Function>).processNewFile(
        "worker-1",
        "m1.yaml",
      );

      expect(handler).toHaveBeenCalledOnce();
    });

    it("不正YAMLは無視し他メッセージの処理をブロックしない", () => {
      const handler = vi.fn();
      bus.onMessage(handler);

      const validMsg: Message = {
        id: "m2",
        from: "a",
        to: "b",
        type: "info",
        payload: "p",
        timestamp: "t",
      };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync
        .mockReturnValueOnce("[invalid: yaml: {{{")
        .mockReturnValueOnce(stringify(validMsg));

      (bus as unknown as Record<string, Function>).processNewFile(
        "worker-1",
        "invalid.yaml",
      );
      (bus as unknown as Record<string, Function>).processNewFile(
        "worker-1",
        "m2.yaml",
      );

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({ id: "m2" }),
      );
    });

    it("全handlerを呼び出す", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.onMessage(handler1);
      bus.onMessage(handler2);

      const msg: Message = {
        id: "m3",
        from: "a",
        to: "b",
        type: "info",
        payload: "p",
        timestamp: "t",
      };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(stringify(msg));

      (bus as unknown as Record<string, Function>).processNewFile(
        "worker-1",
        "m3.yaml",
      );

      expect(handler1).toHaveBeenCalledWith(
        expect.objectContaining({ id: "m3" }),
      );
      expect(handler2).toHaveBeenCalledWith(
        expect.objectContaining({ id: "m3" }),
      );
    });
  });

  describe("notices", () => {
    type Internals = {
      processNewFile: (slug: string, file: string) => void;
      sendNudge: (slug: string) => Promise<boolean>;
      paneQueues: Map<string, Promise<boolean>>;
      wait: (ms: number) => Promise<void>;
    };
    const internals = (b: MessageBus) => b as unknown as Internals;
    const settle = async (b: MessageBus, slug: string) => {
      await internals(b).paneQueues.get(slug);
    };
    const tmuxCalls = () =>
      mockExecFileSync.mock.calls.map((c) => c[1] as string[]);
    const message = (id: string, from = "coordinator"): string =>
      stringify({ id, from, to: "worker-1", type: "task", payload: "p" });
    let frame = 0;
    /** The pane keeps changing, as when the agent starts working */
    const working = () => {
      mockExecFileSync.mockImplementation((_cmd: string, args: string[]) =>
        args[0] === "capture-pane" ? `frame ${frame++}` : undefined,
      );
    };
    /** The pane never changes: the line was not submitted */
    const stuck = () => {
      mockExecFileSync.mockImplementation((_cmd: string, args: string[]) =>
        args[0] === "capture-pane" ? "same" : undefined,
      );
    };
    const handledFile = () => {
      const writes = mockFs.writeFileSync.mock.calls.filter((c) =>
        String(c[0]).endsWith(".handled.json"),
      );
      return JSON.parse(String(writes[writes.length - 1]?.[1] ?? "[]"));
    };
    const onNudgeFailed = vi.fn();

    beforeEach(() => {
      mockExecFileSync.mockReset();
      internals(bus).wait = () => Promise.resolve();
      bus.setNudgeConfig({
        sessionName: "aihive",
        paneTargets: new Map([
          ["worker-1", "workers.0"],
          ["reviewer", "reviewer"],
        ]),
        onNudgeFailed,
      });
      onNudgeFailed.mockReset();
    });

    it("does nothing without a nudge config", async () => {
      const plain = new MessageBus("/test-project");
      internals(plain).wait = () => Promise.resolve();
      mockFs.readFileSync.mockReturnValue(message("n1"));
      internals(plain).processNewFile("worker-1", "n1.yaml");
      await settle(plain, "worker-1");
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("does nothing for an agent without a pane", async () => {
      mockFs.readFileSync.mockReturnValue(message("n1"));
      internals(bus).processNewFile("worker-9", "n1.yaml");
      await settle(bus, "worker-9");
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("pastes one line without a shell, then presses Enter", async () => {
      working();
      mockFs.readFileSync.mockReturnValue(message("n1", "x\n$(rm -rf ~) `id`"));
      internals(bus).processNewFile("worker-1", "n1.yaml");
      await settle(bus, "worker-1");

      expect(mockExecFileSync.mock.calls.every((c) => c[0] === "tmux")).toBe(
        true,
      );
      const calls = tmuxCalls();
      expect(calls[0]).toEqual(["send-keys", "-t", "aihive:workers.0", "C-u"]);
      expect(calls[1].slice(0, 4)).toEqual([
        "set-buffer",
        "-b",
        "aihive-nudge",
        "--",
      ]);
      expect(calls[1][4]).toContain(
        "[inbox: 1件の新着 from x $(rm -rf ~) `id`]",
      );
      expect(calls[1][4]).not.toContain("\n");
      expect(calls[2]).toEqual([
        "paste-buffer",
        "-p",
        "-d",
        "-b",
        "aihive-nudge",
        "-t",
        "aihive:workers.0",
      ]);
      expect(calls[3]).toEqual([
        "send-keys",
        "-t",
        "aihive:workers.0",
        "Enter",
      ]);
      expect(
        calls.filter((c) => c[0] === "send-keys" && c[3] === "Enter"),
      ).toHaveLength(1);
      expect(handledFile()).toEqual(["worker-1/n1.yaml"]);
      expect(onNudgeFailed).not.toHaveBeenCalled();
    });

    it("presses Enter again when the pane does not change, and keeps the message undelivered", async () => {
      stuck();
      mockFs.readFileSync.mockReturnValue(message("n1"));
      internals(bus).processNewFile("worker-1", "n1.yaml");
      await settle(bus, "worker-1");

      const enters = tmuxCalls().filter(
        (c) => c[0] === "send-keys" && c[3] === "Enter",
      );
      expect(enters).toHaveLength(2);
      expect(onNudgeFailed).toHaveBeenCalledWith("worker-1");
      // Not recorded as handled, so a relaunched aihive announces it again
      expect(handledFile()).toEqual([]);
    });

    it("tries again on a later poll and gives up after the last attempt", async () => {
      stuck();
      mockFs.readFileSync.mockReturnValue(message("n1"));
      mockFs.readdirSync.mockReturnValue(["n1.yaml"]);
      internals(bus).processNewFile("worker-1", "n1.yaml");
      await settle(bus, "worker-1");
      for (let i = 1; i < NUDGE_ATTEMPTS; i++) {
        await internals(bus).sendNudge("worker-1");
      }
      expect(onNudgeFailed).toHaveBeenCalledTimes(NUDGE_ATTEMPTS);
      expect(handledFile()).toEqual(["worker-1/n1.yaml"]);

      mockExecFileSync.mockClear();
      expect(await internals(bus).sendNudge("worker-1")).toBe(true);
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("counts only the messages not announced yet", async () => {
      working();
      mockFs.readFileSync.mockReturnValue(message("n1"));
      internals(bus).processNewFile("worker-1", "n1.yaml");
      await settle(bus, "worker-1");
      mockFs.readFileSync.mockReturnValue(message("n2", "worker-2"));
      internals(bus).processNewFile("worker-1", "n2.yaml");
      await settle(bus, "worker-1");

      const texts = tmuxCalls()
        .filter((c) => c[0] === "set-buffer")
        .map((c) => c[4]);
      expect(texts).toHaveLength(2);
      expect(texts[1]).toContain("[inbox: 1件の新着 from worker-2]");
    });

    it("announces messages that arrive together in one notice", async () => {
      working();
      mockFs.readFileSync.mockReturnValue(message("n1"));
      internals(bus).processNewFile("worker-1", "n1.yaml");
      mockFs.readFileSync.mockReturnValue(message("n2", "worker-2"));
      internals(bus).processNewFile("worker-1", "n2.yaml");
      await settle(bus, "worker-1");

      const texts = tmuxCalls()
        .filter((c) => c[0] === "set-buffer")
        .map((c) => c[4]);
      expect(texts).toHaveLength(1);
      expect(texts[0]).toContain("[inbox: 2件の新着 from worker-2]");
    });

    it("does not throw when tmux fails", async () => {
      mockExecFileSync.mockImplementation(() => {
        throw new Error("tmux failed");
      });
      mockFs.readFileSync.mockReturnValue(message("n1"));
      expect(() =>
        internals(bus).processNewFile("worker-1", "n1.yaml"),
      ).not.toThrow();
      await settle(bus, "worker-1");
      expect(onNudgeFailed).toHaveBeenCalledWith("worker-1");
    });

    describe("remindStalled()", () => {
      it("types one reminder line naming the task and the inbox", async () => {
        working();
        expect(await bus.remindStalled("reviewer", "T1-2\nrm -rf", 15)).toBe(
          true,
        );

        const calls = tmuxCalls();
        expect(calls[1].slice(0, 4)).toEqual([
          "set-buffer",
          "-b",
          "aihive-nudge",
          "--",
        ]);
        const text = calls[1][4];
        expect(text).toContain(
          "タスク T1-2 rm -rf が 15分間更新されていません",
        );
        expect(text).toContain("/test-project/.aihive/mailbox/reviewer/inbox/");
        expect(text).not.toContain("\n");
      });

      it("uses English when the language is set to English", async () => {
        working();
        setLocale("en");
        try {
          await bus.remindStalled("reviewer", "T1", 15);
        } finally {
          setLocale("ja");
        }
        const text = tmuxCalls()[1][4];
        expect(text).toContain(
          "[aihive] Task T1 has had no update for 15 min.",
        );
      });

      it("returns false for an agent without a pane", async () => {
        expect(await bus.remindStalled("worker-9", "T1", 15)).toBe(false);
        expect(mockExecFileSync).not.toHaveBeenCalled();
      });
    });
  });

  describe("processNewFile() delivery", () => {
    const msg: Message = {
      id: "d1",
      from: "worker-1",
      to: "system",
      type: "result",
      payload: "p",
      timestamp: "t",
    };
    const processNewFile = (b: MessageBus, slug: string, file: string) =>
      (
        b as unknown as {
          processNewFile: (slug: string, file: string) => void;
        }
      ).processNewFile(slug, file);

    beforeEach(() => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(stringify(msg));
    });

    it("system 宛ては読み取り後に processed/ へ移し、nudge しない", () => {
      bus.setNudgeConfig({
        sessionName: "aihive",
        paneTargets: new Map([[SYSTEM_MAILBOX, "system"]]),
      });
      processNewFile(bus, SYSTEM_MAILBOX, "d1.yaml");

      expect(mockFs.renameSync).toHaveBeenCalledWith(
        "/test-project/.aihive/mailbox/system/inbox/d1.yaml",
        "/test-project/.aihive/mailbox/system/inbox/processed/d1.yaml",
      );
      expect(mockExecFileSync).not.toHaveBeenCalled();
    });

    it("エージェント宛ては移さない（エージェント自身が移す）", () => {
      processNewFile(bus, "worker-1", "d1.yaml");
      expect(mockFs.renameSync).not.toHaveBeenCalled();
    });

    it("handler が例外を投げても他の handler と後続処理は続く", () => {
      const after = vi.fn();
      bus.onMessage(() => {
        throw new Error("boom");
      });
      bus.onMessage(after);

      processNewFile(bus, SYSTEM_MAILBOX, "d1.yaml");

      expect(after).toHaveBeenCalledOnce();
      expect(mockFs.renameSync).toHaveBeenCalledOnce();
    });
  });

  describe("clear()", () => {
    it("processed/ フォルダごと消す", () => {
      mockFs.readdirSync.mockReturnValue(["a.yaml", "processed"]);
      bus.clear(["Worker 1"]);
      expect(mockFs.rmSync).toHaveBeenCalledWith(
        "/test-project/.aihive/mailbox/worker-1/inbox/processed",
        { recursive: true, force: true },
      );
    });
  });

  describe("stopWatching()", () => {
    it("watcher.close()を呼び、seen/watchers/pollTimerをクリアする", () => {
      const mockClose = vi.fn();
      mockFs.watch.mockReturnValue({ close: mockClose });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync.mockReturnValue([]);

      bus.startWatching(["worker-1"]);
      const busAny = bus as unknown as Record<string, unknown>;
      (busAny.seen as Set<string>).add("worker-1/some.yaml");

      expect(busAny.pollTimer).not.toBeNull();

      bus.stopWatching();

      expect(mockClose).toHaveBeenCalled();
      expect((busAny.watchers as Map<string, unknown>).size).toBe(0);
      expect((busAny.seen as Set<string>).size).toBe(0);
      expect(busAny.pollTimer).toBeNull();
    });
  });
});

describe("archiveMessage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("既に移されたファイルでも例外を投げない", () => {
    mockFs.renameSync.mockImplementationOnce(() => {
      throw new Error("ENOENT");
    });
    expect(() => archiveMessage("/inbox", "gone.yaml")).not.toThrow();
  });
});
