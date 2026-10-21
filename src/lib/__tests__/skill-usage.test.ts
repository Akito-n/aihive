import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  findSkillUses,
  historyDirName,
  skillUsesInLine,
} from "../skill-usage.js";

function assistant(content: unknown[]): string {
  return JSON.stringify({
    type: "assistant",
    message: { role: "assistant", content },
  });
}

const skillCall = (id: string, skill: unknown) => ({
  type: "tool_use",
  id,
  name: "Skill",
  input: { skill },
});

describe("skillUsesInLine", () => {
  it("finds Skill tool calls in an assistant message", () => {
    const line = assistant([
      { type: "text", text: "hi" },
      skillCall("toolu_1", "code-review"),
      { type: "tool_use", id: "toolu_2", name: "Bash", input: {} },
      skillCall("toolu_3", "plugin:deploy"),
    ]);
    expect(skillUsesInLine(line)).toEqual([
      { id: "toolu_1", skill: "code-review" },
      { id: "toolu_3", skill: "plugin:deploy" },
    ]);
  });

  it("ignores user lines, broken JSON and odd skill names", () => {
    expect(
      skillUsesInLine(
        JSON.stringify({
          message: { role: "user", content: [skillCall("a", "x")] },
        }),
      ),
    ).toEqual([]);
    expect(skillUsesInLine("{nope")).toEqual([]);
    expect(
      skillUsesInLine(
        assistant([
          skillCall("a", "../../etc"),
          skillCall("b", 5),
          skillCall("c d", "ok"),
        ]),
      ),
    ).toEqual([]);
  });
});

describe("findSkillUses", () => {
  it("reads the history of the agents' directories changed since a time", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "aihive-history-"));
    const dir = path.join(root, historyDirName("/work/proj"));
    fs.mkdirSync(dir);
    fs.writeFileSync(
      path.join(dir, "a.jsonl"),
      `${assistant([skillCall("u1", "review")])}\nnot json\n`,
    );
    const old = path.join(dir, "old.jsonl");
    fs.writeFileSync(old, assistant([skillCall("u0", "old")]));
    fs.utimesSync(old, new Date(1000), new Date(1000));

    expect(
      findSkillUses(["/work/proj", "/work/proj", "/missing"], 5000, root),
    ).toEqual([{ id: "u1", skill: "review" }]);
  });

  it("names history directories the way Claude Code does", () => {
    expect(historyDirName("/home/me/my.app")).toBe("-home-me-my-app");
  });
});
