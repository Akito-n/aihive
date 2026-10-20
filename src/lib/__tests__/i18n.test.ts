import { afterEach, describe, expect, it } from "vitest";
import { en } from "../../locales/en.js";
import { ja } from "../../locales/ja.js";
import { setLocale, tf } from "../i18n.js";
import { renderApprovedIndex, type Skill } from "../skills.js";
import { renderWorkspacePrompt } from "../worktrees.js";

const skill: Skill = {
  id: "run-checks",
  name: "Run checks",
  description: "Run every check",
  trigger: "before reporting",
  steps: ["npm test"],
  created_by: "worker-1",
  approved_by: "coordinator",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

afterEach(() => setLocale("ja"));

describe("tf", () => {
  it("fills placeholders and leaves unknown ones as they are", () => {
    setLocale("en");
    expect(tf("agentMsg.inboxNudge", { count: 2, from: "coordinator" })).toBe(
      "[inbox: 2 new from coordinator] Check {dir}/",
    );
  });

  it("does not expand placeholders inside the values", () => {
    setLocale("en");
    expect(
      tf("skillsIndex.trigger", { trigger: "{dir} and $& stay literal" }),
    ).toBe("- Trigger: {dir} and $& stay literal");
  });
});

describe("locales", () => {
  it("ja has every key that en has, with the same placeholders", () => {
    const placeholders = (s: string) =>
      [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(ja[key], key).toBeTypeOf("string");
      expect(placeholders(ja[key]), key).toEqual(placeholders(en[key]));
    }
  });
});

describe("agent-facing text follows the language setting", () => {
  it("writes APPROVED.md in English", () => {
    setLocale("en");
    const out = renderApprovedIndex([skill]);
    expect(out).toContain("# Approved skills");
    expect(out).toContain("- Trigger: before reporting");
    expect(out).toContain("- Proposed by: worker-1 / approved by: coordinator");
    expect(out).toContain("### Steps");
    expect(renderApprovedIndex([])).toContain("No approved skills yet.");
  });

  it("writes the worker's workspace section in English", () => {
    setLocale("en");
    const out = renderWorkspacePrompt("unknown-role", {
      projectDir: "/proj",
      worktreeDir: "/wt/worker-1",
      branch: "aihive/worker-1",
      integrationBranch: "main",
    });
    expect(out).toContain("## Where you work (set up by aihive)");
    expect(out).toContain("- Working folder: `/wt/worker-1`");
    expect(out).toContain("run `git merge main`");
  });
});
