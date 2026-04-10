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
import { SkillManager } from "../skills.js";

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
