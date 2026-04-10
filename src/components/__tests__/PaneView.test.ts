import { describe, expect, it } from "vitest";
import { detectPrompt } from "../PaneView.js";

describe("detectPrompt()", () => {
  // ─── No match ───────────────────────────────────────────────────────

  it("returns detected=false for plain text", () => {
    const result = detectPrompt("Running tests...\nAll passed.");
    expect(result.detected).toBe(false);
    expect(result.options).toEqual([]);
  });

  it("returns detected=false for empty string", () => {
    const result = detectPrompt("");
    expect(result.detected).toBe(false);
  });

  // ─── Numbered option pattern ─────────────────────────────────────────

  it("detects › 1. Yes style prompt", () => {
    const text = "  › 1. Yes\n  › 2. No";
    const result = detectPrompt(text);
    expect(result.detected).toBe(true);
  });

  it("extracts numbered options", () => {
    const text = "  › 1. Yes\n  › 2. Yes, allow all\n  › 3. No";
    const result = detectPrompt(text);
    expect(result.options).toEqual(["1. Yes", "2. Yes, allow all", "3. No"]);
  });

  it("detects > 1. Yes style prompt (angle bracket)", () => {
    const text = "> 1. Yes\n> 2. No";
    const result = detectPrompt(text);
    expect(result.detected).toBe(true);
    expect(result.options).toEqual(["1. Yes", "2. No"]);
  });

  // ─── "Do you want to" pattern ────────────────────────────────────────

  it("detects 'Do you want to overwrite?' prompt", () => {
    const result = detectPrompt("Do you want to overwrite the file?");
    expect(result.detected).toBe(true);
  });

  it("is case-insensitive for 'do you want to'", () => {
    const result = detectPrompt("do you want to proceed?");
    expect(result.detected).toBe(true);
  });

  // ─── (y/n) pattern ───────────────────────────────────────────────────

  it("detects (y/n) prompt and returns default options", () => {
    const result = detectPrompt("Continue? (y/n)");
    expect(result.detected).toBe(true);
    expect(result.options).toEqual(["y", "n"]);
  });

  it("detects (Y/n) prompt and returns default options", () => {
    const result = detectPrompt("Overwrite? (Y/n)");
    expect(result.detected).toBe(true);
    expect(result.options).toEqual(["y", "n"]);
  });

  it("does not add default y/n options when numbered options already exist", () => {
    const text = "Do you want to proceed? (y/n)\n  › 1. Yes\n  › 2. No";
    const result = detectPrompt(text);
    expect(result.detected).toBe(true);
    // Numbered options take precedence
    expect(result.options).toContain("1. Yes");
    expect(result.options).toContain("2. No");
    expect(result.options).not.toContain("y");
  });

  // ─── "Esc to cancel" pattern ─────────────────────────────────────────

  it("detects 'Esc to cancel' prompt", () => {
    const result = detectPrompt("Select an action  Esc to cancel");
    expect(result.detected).toBe(true);
  });

  it("detects 'Esc to cancel' regardless of surrounding text", () => {
    const result = detectPrompt("Use arrow keys, Esc to cancel selection");
    expect(result.detected).toBe(true);
  });

  // ─── Mixed patterns ───────────────────────────────────────────────────

  it("handles mixed prompt text with numbered options and Esc to cancel", () => {
    const text = ["  › 1. Yes", "  › 2. No, skip", "  Esc to cancel"].join(
      "\n",
    );
    const result = detectPrompt(text);
    expect(result.detected).toBe(true);
    expect(result.options).toEqual(["1. Yes", "2. No, skip"]);
  });

  // ─── Option trimming ──────────────────────────────────────────────────

  it("trims trailing whitespace from extracted options", () => {
    const text = "  › 1. Yes   \n  › 2. No  ";
    const result = detectPrompt(text);
    expect(result.options[0]).toBe("1. Yes");
    expect(result.options[1]).toBe("2. No");
  });
});
