import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";

const mockFs = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true as boolean),
  readdirSync: vi.fn(() => [] as string[]),
  watch: vi.fn(() => ({ close: vi.fn() })),
  readFileSync: vi.fn(() => ""),
}));

const mockExecSync = vi.hoisted(() => vi.fn());

vi.mock("node:fs", () => ({ default: mockFs }));
vi.mock("node:child_process", () => ({ execSync: mockExecSync }));

import { type Message, MessageBus, toSlug } from "../mailbox.js";

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
      mockFs.existsSync.mockImplementation((p: unknown) => {
        return !(p as string).includes("outbox");
      });

      expect(() => bus.send("coordinator", "worker-1", "task", "payload")).not.toThrow();
      const paths = mockFs.writeFileSync.mock.calls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("/coordinator/outbox/"))).toBe(false);
      expect(paths.some((p) => p.includes("/worker-1/inbox/"))).toBe(true);
    });
  });

  describe("processNewFile()", () => {
    it("同一key（slug/filename）を二重処理しない（seen set）", () => {
      const handler = vi.fn();
      bus.onMessage(handler);

      const msg: Message = { id: "m1", from: "a", to: "b", type: "info", payload: "p", timestamp: "t" };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(stringify(msg));

      (bus as unknown as Record<string, Function>).processNewFile("worker-1", "m1.yaml");
      (bus as unknown as Record<string, Function>).processNewFile("worker-1", "m1.yaml");

      expect(handler).toHaveBeenCalledOnce();
    });

    it("不正YAMLは無視し他メッセージの処理をブロックしない", () => {
      const handler = vi.fn();
      bus.onMessage(handler);

      const validMsg: Message = { id: "m2", from: "a", to: "b", type: "info", payload: "p", timestamp: "t" };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync
        .mockReturnValueOnce("[invalid: yaml: {{{")
        .mockReturnValueOnce(stringify(validMsg));

      (bus as unknown as Record<string, Function>).processNewFile("worker-1", "invalid.yaml");
      (bus as unknown as Record<string, Function>).processNewFile("worker-1", "m2.yaml");

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
    });

    it("全handlerを呼び出す", () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      bus.onMessage(handler1);
      bus.onMessage(handler2);

      const msg: Message = { id: "m3", from: "a", to: "b", type: "info", payload: "p", timestamp: "t" };
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(stringify(msg));

      (bus as unknown as Record<string, Function>).processNewFile("worker-1", "m3.yaml");

      expect(handler1).toHaveBeenCalledWith(expect.objectContaining({ id: "m3" }));
      expect(handler2).toHaveBeenCalledWith(expect.objectContaining({ id: "m3" }));
    });
  });

  describe("sendNudge()", () => {
    const msg: Message = { id: "n1", from: "coordinator", to: "worker-1", type: "task", payload: "p", timestamp: "t" };

    it("nudgeConfig=nullのとき何もしない", () => {
      (bus as unknown as Record<string, Function>).sendNudge("worker-1", msg);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it("paneTargets.get(slug)がundefinedのとき何もしない", () => {
      bus.setNudgeConfig({ sessionName: "aihive", paneTargets: new Map() });
      (bus as unknown as Record<string, Function>).sendNudge("worker-1", msg);
      expect(mockExecSync).not.toHaveBeenCalled();
    });

    it("execSync失敗でも例外を伝播しない", () => {
      bus.setNudgeConfig({
        sessionName: "aihive",
        paneTargets: new Map([["worker-1", "worker-1"]]),
      });
      mockFs.readdirSync.mockReturnValue(["msg.yaml"] as unknown as string[]);
      mockExecSync.mockImplementation(() => {
        throw new Error("tmux failed");
      });

      expect(() =>
        (bus as unknown as Record<string, Function>).sendNudge("worker-1", msg)
      ).not.toThrow();
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
