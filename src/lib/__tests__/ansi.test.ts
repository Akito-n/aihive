import { describe, expect, it } from "vitest";
import { color256ToHex, parseAnsi, stripAnsi } from "../ansi.js";

describe("parseAnsi", () => {
  it("プレーンテキスト（エスケープなし）をそのまま返す", () => {
    const result = parseAnsi("hello world");
    expect(result).toEqual([{ text: "hello world" }]);
  });

  it("空文字列は空配列を返す", () => {
    const result = parseAnsi("");
    expect(result).toEqual([]);
  });

  it("単純SGR: ESC[31m → fg:red", () => {
    const result = parseAnsi("\x1b[31mred text");
    expect(result).toEqual([{ text: "red text", fg: "red" }]);
  });

  it("ESC[0m でリセットされる", () => {
    const result = parseAnsi("\x1b[31mred\x1b[0mnormal");
    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ text: "red", fg: "red" });
    expect(result[1]).toEqual({ text: "normal" });
  });

  it("太字+色の複合属性", () => {
    const result = parseAnsi("\x1b[1;32mbold green");
    expect(result).toEqual([{ text: "bold green", fg: "green", bold: true }]);
  });

  it("256色FG: ESC[38;5;196m", () => {
    const result = parseAnsi("\x1b[38;5;196mtext");
    expect(result[0].fg).toBeDefined();
    expect(result[0].text).toBe("text");
  });

  it("TrueColor FG: ESC[38;2;255;128;0m", () => {
    const result = parseAnsi("\x1b[38;2;255;128;0morange");
    expect(result).toEqual([{ text: "orange", fg: "#ff8000" }]);
  });

  it("カーソル移動等の非SGRコードはテキストに残らない", () => {
    const result = parseAnsi("before\x1b[2Jafter");
    expect(result.map((s) => s.text).join("")).toBe("beforeafter");
  });

  it("エスケープシーケンスのみで本文なしは空配列", () => {
    const result = parseAnsi("\x1b[31m");
    expect(result).toEqual([]);
  });

  it("複数テキストセグメント", () => {
    const result = parseAnsi("a\x1b[31mb\x1b[0mc");
    expect(result).toHaveLength(3);
    expect(result[0].text).toBe("a");
    expect(result[1].text).toBe("b");
    expect(result[2].text).toBe("c");
  });
});

describe("color256ToHex", () => {
  describe("0-15: 標準色", () => {
    it("0 → #000000 (black)", () => {
      expect(color256ToHex(0)).toBe("#000000");
    });

    it("7 → #aaaaaa (white)", () => {
      expect(color256ToHex(7)).toBe("#aaaaaa");
    });

    it("8 → #555555 (bright black)", () => {
      expect(color256ToHex(8)).toBe("#555555");
    });

    it("15 → #ffffff (bright white)", () => {
      expect(color256ToHex(15)).toBe("#ffffff");
    });
  });

  describe("16-231: 6x6x6 cube", () => {
    it("16 → #000000 (cube origin)", () => {
      expect(color256ToHex(16)).toBe("#000000");
    });

    it("231 → #ffffff (cube far end)", () => {
      expect(color256ToHex(231)).toBe("#ffffff");
    });

    it("21 → #0000ff (pure blue in cube)", () => {
      // idx=5, r=0,g=0,b=5 → #0000ff
      expect(color256ToHex(21)).toBe("#0000ff");
    });

    it("196 → #ff0000 (pure red in cube)", () => {
      // idx=180, r=5,g=0,b=0 → #ff0000
      expect(color256ToHex(196)).toBe("#ff0000");
    });
  });

  describe("232-255: グレースケール", () => {
    it("232 → #080808 (darkest gray)", () => {
      expect(color256ToHex(232)).toBe("#080808");
    });

    it("255 → #eeeeee (lightest gray)", () => {
      expect(color256ToHex(255)).toBe("#eeeeee");
    });

    it("244 → #808080 (mid gray)", () => {
      // level = 8 + (244-232)*10 = 8 + 120 = 128 = 0x80
      expect(color256ToHex(244)).toBe("#808080");
    });
  });
});

describe("stripAnsi", () => {
  it("ANSIコードをすべて除去する", () => {
    expect(stripAnsi("\x1b[31mred\x1b[0m text")).toBe("red text");
  });

  it("プレーンテキストはそのまま返す", () => {
    expect(stripAnsi("plain text")).toBe("plain text");
  });

  it("空文字列は空文字列を返す", () => {
    expect(stripAnsi("")).toBe("");
  });

  it("複数シーケンスをまとめて除去する", () => {
    expect(stripAnsi("\x1b[1m\x1b[32mbold green\x1b[0m")).toBe("bold green");
  });

  it("カーソル移動シーケンスも除去する", () => {
    expect(stripAnsi("a\x1b[2Jb")).toBe("ab");
  });
});
