import type { Key } from "ink";
import { describe, expect, it } from "vitest";
import {
  hasAgentExited,
  isDirectExitKey,
  LAUNCH_GRACE_MS,
  promptKeys,
  toPaneKeys,
} from "../pane-keys.js";

const NO_KEY: Key = {
  upArrow: false,
  downArrow: false,
  leftArrow: false,
  rightArrow: false,
  pageDown: false,
  pageUp: false,
  home: false,
  end: false,
  return: false,
  escape: false,
  ctrl: false,
  shift: false,
  tab: false,
  backspace: false,
  delete: false,
  meta: false,
  super: false,
  hyper: false,
  capsLock: false,
  numLock: false,
};
const key = (extra: Partial<Key> = {}): Key => ({ ...NO_KEY, ...extra });

describe("promptKeys", () => {
  it("moves through a menu with the arrows and confirms with Enter", () => {
    expect(promptKeys("", key({ downArrow: true }))).toEqual(["Down"]);
    expect(promptKeys("", key({ upArrow: true }))).toEqual(["Up"]);
    expect(promptKeys("", key({ return: true }))).toEqual(["Enter"]);
  });

  it("sends a digit or y/n alone, without an Enter after it", () => {
    expect(promptKeys("2", key())).toEqual(["2"]);
    expect(promptKeys("y", key())).toEqual(["y"]);
  });

  it("leaves other keys to the input", () => {
    expect(promptKeys("a", key())).toBeUndefined();
    expect(promptKeys("y", key({ ctrl: true }))).toBeUndefined();
  });
});

describe("toPaneKeys", () => {
  it("names special keys the way tmux does", () => {
    expect(toPaneKeys("", key({ return: true }))).toEqual({ keys: ["Enter"] });
    expect(toPaneKeys("", key({ escape: true }))).toEqual({
      keys: ["Escape"],
    });
    expect(toPaneKeys("", key({ delete: true }))).toEqual({
      keys: ["BSpace"],
    });
    expect(toPaneKeys("", key({ tab: true, shift: true }))).toEqual({
      keys: ["BTab"],
    });
  });

  it("sends Ctrl and Meta combinations", () => {
    expect(toPaneKeys("r", key({ ctrl: true }))).toEqual({ keys: ["C-r"] });
    expect(toPaneKeys("b", key({ meta: true }))).toEqual({ keys: ["M-b"] });
  });

  it("types printable text as it is", () => {
    expect(toPaneKeys("こんにちは", key())).toEqual({ literal: "こんにちは" });
  });

  it("ignores keys with nothing to send", () => {
    expect(toPaneKeys("", key())).toBeUndefined();
  });
});

describe("isDirectExitKey", () => {
  it("is Ctrl+Q only", () => {
    expect(isDirectExitKey("q", key({ ctrl: true }))).toBe(true);
    expect(isDirectExitKey("q", key())).toBe(false);
  });
});

describe("hasAgentExited", () => {
  it("counts a shell after the CLI was seen running", () => {
    expect(hasAgentExited("zsh", true, 0)).toBe(true);
  });

  it("gives a fresh launch time to start before a shell counts", () => {
    expect(hasAgentExited("zsh", false, 1000)).toBe(false);
    expect(hasAgentExited("zsh", false, LAUNCH_GRACE_MS)).toBe(true);
  });

  it("is false while the CLI runs or the pane is unknown", () => {
    expect(hasAgentExited("claude", true, LAUNCH_GRACE_MS)).toBe(false);
    expect(hasAgentExited(undefined, true, LAUNCH_GRACE_MS)).toBe(false);
  });
});
