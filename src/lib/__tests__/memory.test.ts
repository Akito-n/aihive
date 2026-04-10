import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";

const mockFs = vi.hoisted(() => ({
  mkdirSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false as boolean),
  readdirSync: vi.fn(() => [] as string[]),
  statSync: vi.fn(() => ({ isDirectory: () => true })),
  readFileSync: vi.fn(() => "" as string),
}));

vi.mock("node:fs", () => ({ default: mockFs }));

import { type MemoryEntry, MemoryManager } from "../memory.js";

function makeEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "entry-1",
    key: "my-key",
    value: "my-value",
    tags: [],
    created_by: "agent-1",
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("MemoryManager", () => {
  let mm: MemoryManager;

  beforeEach(() => {
    vi.clearAllMocks();
    mockFs.existsSync.mockReturnValue(false);
    mockFs.readdirSync.mockReturnValue([]);
    mockFs.statSync.mockReturnValue({ isDirectory: () => true });
    mm = new MemoryManager("/test-project");
  });

  describe("write()", () => {
    it("新規エントリを追加できる", () => {
      const entry = makeEntry();
      mm.write(entry);
      expect(mm.read("entry-1")).toEqual(entry);
    });

    it("既存IDの場合 updated_at を更新し created_at は変えない", () => {
      const originalTime = "2024-01-01T00:00:00.000Z";
      mm.write(
        makeEntry({
          id: "e1",
          created_at: originalTime,
          updated_at: originalTime,
        }),
      );

      const before = Date.now();
      mm.write(
        makeEntry({
          id: "e1",
          created_at: originalTime,
          updated_at: originalTime,
        }),
      );
      const after = Date.now();

      const stored = mm.read("e1")!;
      expect(stored.created_at).toBe(originalTime);
      const storedTime = new Date(stored.updated_at).getTime();
      expect(storedTime).toBeGreaterThanOrEqual(before);
      expect(storedTime).toBeLessThanOrEqual(after);
    });
  });

  describe("search()", () => {
    it("keyのマッチでエントリを返す", () => {
      mm.write(
        makeEntry({ id: "e1", key: "database-url", value: "postgres://..." }),
      );
      mm.write(makeEntry({ id: "e2", key: "api-key", value: "secret" }));
      const results = mm.search("database");
      expect(results).toHaveLength(1);
      expect(results[0].id).toBe("e1");
    });

    it("valueのマッチでエントリを返す", () => {
      mm.write(
        makeEntry({ id: "e1", key: "k1", value: "important configuration" }),
      );
      expect(mm.search("important")).toHaveLength(1);
    });

    it("tagsのマッチでエントリを返す", () => {
      mm.write(
        makeEntry({
          id: "e1",
          key: "k1",
          value: "v1",
          tags: ["production", "critical"],
        }),
      );
      expect(mm.search("production")).toHaveLength(1);
    });

    it("agentSlug指定時、他エージェントのエントリを除外する", () => {
      mm.write(
        makeEntry({ id: "e1", key: "k1", value: "v", created_by: "agent-1" }),
      );
      mm.write(
        makeEntry({ id: "e2", key: "k2", value: "v", created_by: "agent-2" }),
      );
      const ids = mm.search("v", "agent-1").map((e) => e.id);
      expect(ids).toContain("e1");
      expect(ids).not.toContain("e2");
    });

    it('"shared"スコープのエントリはagentSlug指定時も表示される', () => {
      // created_by: 'shared' → getEntryScope returns 'shared'
      mm.write(
        makeEntry({
          id: "s1",
          key: "common",
          value: "v",
          created_by: "shared",
        }),
      );
      mm.write(
        makeEntry({ id: "o1", key: "own", value: "v", created_by: "agent-1" }),
      );
      mm.write(
        makeEntry({
          id: "x1",
          key: "other",
          value: "v",
          created_by: "agent-2",
        }),
      );
      const ids = mm.search("v", "agent-1").map((e) => e.id);
      expect(ids).toContain("s1");
      expect(ids).toContain("o1");
      expect(ids).not.toContain("x1");
    });
  });

  describe("save() via write()", () => {
    it('"shared"タグ付きエントリを shared/ にも保存する', () => {
      mm.write(
        makeEntry({ id: "se1", created_by: "agent-1", tags: ["shared"] }),
      );
      const paths = mockFs.writeFileSync.mock.calls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("/agent-1/"))).toBe(true);
      expect(paths.some((p) => p.includes("/shared/"))).toBe(true);
    });

    it('"shared"タグなしエントリは自分のディレクトリにのみ保存する', () => {
      mm.write(makeEntry({ id: "le1", created_by: "agent-1", tags: [] }));
      const paths = mockFs.writeFileSync.mock.calls.map((c) => c[0] as string);
      expect(paths.some((p) => p.includes("/agent-1/"))).toBe(true);
      expect(paths.some((p) => p.includes("/shared/"))).toBe(false);
    });
  });

  describe("loadAll() via init()", () => {
    it("サブディレクトリを再帰的に走査してエントリを読み込む", () => {
      const entry = makeEntry({
        id: "loaded-1",
        key: "loaded-key",
        value: "loaded-value",
      });
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync
        .mockReturnValueOnce(["agent-1"] as unknown as string[])
        .mockReturnValueOnce(["loaded-1.yaml"] as unknown as string[]);
      mockFs.readFileSync.mockReturnValue(stringify(entry));

      mm.init([]);
      expect(mm.read("loaded-1")).toMatchObject({ key: "loaded-key" });
    });

    it("重複IDの場合は後から読んだエントリが勝つ", () => {
      const first = makeEntry({
        id: "dup",
        value: "first",
        created_by: "alpha",
      });
      const second = makeEntry({
        id: "dup",
        value: "second",
        created_by: "beta",
      });

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readdirSync
        .mockReturnValueOnce(["alpha", "beta"] as unknown as string[])
        .mockReturnValueOnce(["dup.yaml"] as unknown as string[])
        .mockReturnValueOnce(["dup.yaml"] as unknown as string[]);
      mockFs.readFileSync
        .mockReturnValueOnce(stringify(first))
        .mockReturnValueOnce(stringify(second));

      mm.init([]);
      expect(mm.read("dup")?.value).toBe("second");
    });
  });
});
