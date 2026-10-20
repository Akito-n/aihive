import { beforeEach, describe, expect, it, vi } from "vitest";
import { stringify } from "yaml";
import type { Skill } from "../skills.js";

// Mock node:fs before importing SkillManager
vi.mock("node:fs", () => {
  const m = {
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    readFileSync: vi.fn().mockReturnValue(""),
    readdirSync: vi.fn().mockReturnValue([]),
    existsSync: vi.fn().mockReturnValue(true),
  };
  return { default: m, ...m };
});

import fs from "node:fs";
import {
  APPROVED_INDEX_FILE,
  normalizeSkill,
  renderApprovedIndex,
  SkillManager,
} from "../skills.js";

// ─── Helpers ─────────────────────────────────────────────────────────

function makeSkill(overrides: Partial<Skill> = {}): Skill {
  return {
    id: "skill-1",
    name: "Test Skill",
    description: "A test skill",
    trigger: "when testing",
    steps: ["step 1"],
    created_by: "worker-1",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeSm(): SkillManager {
  // Bypass init() to keep tests isolated from fs setup
  return new SkillManager("/project");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(fs.readFileSync).mockReturnValue("");
  vi.mocked(fs.readdirSync).mockReturnValue([]);
  vi.mocked(fs.existsSync).mockReturnValue(true);
});

// ─── propose() ───────────────────────────────────────────────────────

describe("SkillManager.propose()", () => {
  it("adds skill to in-memory entries", () => {
    const sm = makeSm();
    sm.propose(makeSkill());
    expect(sm.getAll()).toHaveLength(1);
    expect(sm.getAll()[0].state).toBe("proposed");
  });

  it("calls writeFileSync (save to disk)", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1" }));
    expect(vi.mocked(fs.writeFileSync)).toHaveBeenCalledOnce();
    const [filePath] = vi.mocked(fs.writeFileSync).mock.calls[0];
    expect(String(filePath)).toContain("s1.yaml");
  });
});

// ─── approve() ───────────────────────────────────────────────────────

describe("SkillManager.approve()", () => {
  it("returns true and sets state to approved for a proposed skill", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1" }));
    const result = sm.approve("s1", "reviewer");
    expect(result).toBe(true);
    expect(sm.getAll()[0].state).toBe("approved");
    expect(sm.getAll()[0].skill.approved_by).toBe("reviewer");
  });

  it("returns false when skill is not in proposed state", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1" }));
    sm.approve("s1", "reviewer"); // now approved
    const result = sm.approve("s1", "reviewer2");
    expect(result).toBe(false);
  });

  it("returns false for unknown id", () => {
    const sm = makeSm();
    expect(sm.approve("nonexistent", "reviewer")).toBe(false);
  });
});

// ─── reject() ────────────────────────────────────────────────────────

describe("SkillManager.reject()", () => {
  it("returns true and sets state to rejected for a proposed skill", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1" }));
    const result = sm.reject("s1");
    expect(result).toBe(true);
    expect(sm.getAll()[0].state).toBe("rejected");
  });

  it("returns false when skill is not in proposed state", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1" }));
    sm.approve("s1", "reviewer");
    expect(sm.reject("s1")).toBe(false);
  });

  it("returns false for unknown id", () => {
    const sm = makeSm();
    expect(sm.reject("nonexistent")).toBe(false);
  });
});

// ─── getCounts() ─────────────────────────────────────────────────────

describe("SkillManager.getCounts()", () => {
  it("returns zero counts when empty", () => {
    const sm = makeSm();
    expect(sm.getCounts()).toEqual({ proposed: 0, approved: 0, rejected: 0 });
  });

  it("counts correctly across all three states", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "p1" }));
    sm.propose(makeSkill({ id: "p2" }));
    sm.propose(makeSkill({ id: "a1" }));
    sm.approve("a1", "reviewer");
    sm.propose(makeSkill({ id: "r1" }));
    sm.reject("r1");

    expect(sm.getCounts()).toEqual({ proposed: 2, approved: 1, rejected: 1 });
  });
});

// ─── findByTrigger() ─────────────────────────────────────────────────

describe("SkillManager.findByTrigger()", () => {
  it("matches on trigger field", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1", trigger: "when writing tests" }));
    sm.approve("s1", "reviewer");
    expect(sm.findByTrigger("test")).toHaveLength(1);
  });

  it("matches on name field", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1", name: "PR Reviewer", trigger: "other" }));
    sm.approve("s1", "reviewer");
    expect(sm.findByTrigger("reviewer")).toHaveLength(1);
  });

  it("matches on description field", () => {
    const sm = makeSm();
    sm.propose(
      makeSkill({
        id: "s1",
        description: "helps with code review",
        trigger: "x",
      }),
    );
    sm.approve("s1", "reviewer");
    expect(sm.findByTrigger("code review")).toHaveLength(1);
  });

  it("returns only approved skills (not proposed)", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1", trigger: "matching trigger" }));
    // Not approved
    expect(sm.findByTrigger("matching")).toHaveLength(0);
  });

  it("is case-insensitive", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1", trigger: "When Testing Code" }));
    sm.approve("s1", "reviewer");
    expect(sm.findByTrigger("testing code")).toHaveLength(1);
  });
});

// ─── loadAll() via init() ─────────────────────────────────────────────

describe("SkillManager.loadAll() (via init())", () => {
  it("loads skills from yaml files", () => {
    const skill = makeSkill({ id: "loaded-1", name: "Loaded Skill" });
    const yaml = stringify({ ...skill, state: "approved" }, { indent: 2 });

    vi.mocked(fs.readdirSync).mockReturnValue(["loaded-1.yaml"] as never);
    vi.mocked(fs.readFileSync).mockReturnValue(yaml as never);

    const sm = new SkillManager("/project");
    sm.init();

    expect(sm.getAll()).toHaveLength(1);
    expect(sm.getAll()[0].skill.id).toBe("loaded-1");
    expect(sm.getAll()[0].state).toBe("approved");
  });

  it("treats state-less yaml as approved", () => {
    const skill = makeSkill({ id: "no-state" });
    // No state field in yaml
    const yaml = stringify(skill, { indent: 2 });

    vi.mocked(fs.readdirSync).mockReturnValue(["no-state.yaml"] as never);
    vi.mocked(fs.readFileSync).mockReturnValue(yaml as never);

    const sm = new SkillManager("/project");
    sm.init();

    expect(sm.getAll()[0].state).toBe("approved");
  });

  it("skips non-yaml files", () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      "skill.yaml",
      "readme.txt",
      "notes.md",
    ] as never);
    vi.mocked(fs.readFileSync).mockReturnValue(
      stringify(makeSkill({ id: "s1" }), { indent: 2 }) as never,
    );

    const sm = new SkillManager("/project");
    sm.init();

    // Only the .yaml file should be loaded
    expect(sm.getAll()).toHaveLength(1);
  });

  it("skips malformed yaml files without throwing", () => {
    vi.mocked(fs.readdirSync).mockReturnValue(["bad.yaml"] as never);
    vi.mocked(fs.readFileSync).mockReturnValue("{ invalid: [yaml" as never);

    const sm = new SkillManager("/project");
    expect(() => sm.init()).not.toThrow();
    expect(sm.getAll()).toHaveLength(0);
  });

  it("returns early when skillsDir does not exist", () => {
    vi.mocked(fs.existsSync).mockReturnValue(false);

    const sm = new SkillManager("/project");
    sm.init();

    expect(vi.mocked(fs.readdirSync)).not.toHaveBeenCalled();
    expect(sm.getAll()).toHaveLength(0);
  });
});

// ─── Approved index (APPROVED.md) ─────────────────────────────────────

function indexWrites(): string[] {
  return vi
    .mocked(fs.writeFileSync)
    .mock.calls.filter(([p]) => String(p).endsWith(APPROVED_INDEX_FILE))
    .map(([, content]) => String(content));
}

describe("renderApprovedIndex", () => {
  it("says there are no skills yet when the list is empty", () => {
    expect(renderApprovedIndex([])).toContain("承認済みスキルはまだありません");
  });

  it("renders name, id, trigger and numbered steps sorted by id", () => {
    const out = renderApprovedIndex([
      makeSkill({ id: "b-skill", name: "B", steps: ["first", "second"] }),
      makeSkill({ id: "a-skill", name: "A", trigger: "when A applies" }),
    ]);
    expect(out).toContain("## A (`a-skill`)");
    expect(out).toContain("- 適用条件: when A applies");
    expect(out).toContain("1. first\n2. second");
    expect(out.indexOf("a-skill")).toBeLessThan(out.indexOf("b-skill"));
  });

  it("shows the approver when present", () => {
    const out = renderApprovedIndex([
      makeSkill({ created_by: "worker-1", approved_by: "coordinator" }),
    ]);
    expect(out).toContain("提案: worker-1 / 承認: coordinator");
  });
});

describe("SkillManager approved index", () => {
  beforeEach(() => {
    vi.mocked(fs.writeFileSync).mockClear();
    vi.mocked(fs.readdirSync).mockReturnValue([]);
  });

  it("init() writes the index", () => {
    const sm = makeSm();
    sm.init();
    expect(indexWrites()).toHaveLength(1);
  });

  it("approve() rewrites the index including the approved skill", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1", name: "Approved One" }));
    expect(indexWrites()).toHaveLength(0);

    sm.approve("s1", "coordinator");
    const writes = indexWrites();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toContain("Approved One");
  });

  it("proposed and rejected skills are not listed", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "ok", name: "Kept" }));
    sm.propose(makeSkill({ id: "no", name: "Dropped" }));
    sm.propose(makeSkill({ id: "wait", name: "Pending" }));
    sm.reject("no");
    sm.approve("ok", "coordinator");

    const latest = indexWrites().at(-1) ?? "";
    expect(latest).toContain("Kept");
    expect(latest).not.toContain("Dropped");
    expect(latest).not.toContain("Pending");
  });

  it("re-proposing an approved skill removes it from the index", () => {
    const sm = makeSm();
    sm.propose(makeSkill({ id: "s1", name: "Again" }));
    sm.approve("s1", "coordinator");
    sm.propose(makeSkill({ id: "s1", name: "Again" }));

    const latest = indexWrites().at(-1) ?? "";
    expect(latest).not.toContain("Again");
  });

  it("the index file itself is not loaded as a skill", () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      APPROVED_INDEX_FILE,
    ] as unknown as ReturnType<typeof fs.readdirSync>);
    const sm = makeSm();
    sm.init();
    expect(sm.getAll()).toHaveLength(0);
  });
});

// ─── Validation ──────────────────────────────────────────────────────

describe("normalizeSkill", () => {
  it("coerces a string steps field into a list", () => {
    expect(normalizeSkill({ id: "s", steps: "do x" })?.steps).toEqual(["do x"]);
  });

  it("fills missing fields with defaults", () => {
    const skill = normalizeSkill({ id: "s" });
    expect(skill).toMatchObject({
      id: "s",
      name: "s",
      description: "",
      trigger: "",
      steps: [],
      created_by: "unknown",
    });
  });

  it.each([[{}], [{ id: "../x" }], [{ id: "a/b" }], [null], ["s"]])(
    "rejects %j",
    (data) => {
      expect(normalizeSkill(data)).toBeNull();
    },
  );
});

describe("SkillManager with malformed agent input", () => {
  it("propose() rejects an unsafe id without writing", () => {
    const sm = makeSm();
    expect(sm.propose({ id: "../escape", steps: [] })).toBe(false);
    expect(sm.getAll()).toHaveLength(0);
    expect(fs.writeFileSync).not.toHaveBeenCalled();
  });

  it("approving a skill with string steps renders the index", () => {
    const sm = makeSm();
    expect(sm.propose({ ...makeSkill(), steps: "do x" })).toBe(true);
    expect(() => sm.approve("skill-1", "coordinator")).not.toThrow();
  });

  it("init() survives an approved skill file with malformed steps", () => {
    vi.mocked(fs.readdirSync).mockReturnValue([
      "bad.yaml",
    ] as unknown as ReturnType<typeof fs.readdirSync>);
    vi.mocked(fs.readFileSync).mockReturnValue(
      stringify({ id: "bad", name: "Bad", steps: "do x", state: "approved" }),
    );
    const sm = makeSm();
    expect(() => sm.init()).not.toThrow();
    expect(sm.getApproved()[0].steps).toEqual(["do x"]);
  });
});
