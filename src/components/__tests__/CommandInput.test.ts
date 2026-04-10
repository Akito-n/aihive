import { describe, expect, it } from "vitest";
import type { PasteRange } from "../CommandInput.js";
import {
  buildDisplay,
  displayToReal,
  displayWidth,
  pasteAlias,
  realToDisplay,
  sliceByWidth,
} from "../CommandInput.js";

describe("displayWidth", () => {
  it("returns 1 for each ASCII character", () => {
    expect(displayWidth("hello")).toBe(5);
    expect(displayWidth("a")).toBe(1);
    expect(displayWidth("")).toBe(0);
  });

  it("returns 2 for CJK characters (Hiragana/Katakana)", () => {
    expect(displayWidth("あ")).toBe(2);
    expect(displayWidth("い")).toBe(2);
    expect(displayWidth("アイウ")).toBe(6);
  });

  it("returns 2 for CJK unified ideographs", () => {
    expect(displayWidth("中")).toBe(2);
    expect(displayWidth("漢字")).toBe(4);
  });

  it("returns 2 for fullwidth forms (U+FF01-U+FF60)", () => {
    // Fullwidth Latin capital A (U+FF21)
    expect(displayWidth("\uFF21")).toBe(2);
    // Fullwidth exclamation mark (U+FF01)
    expect(displayWidth("\uFF01")).toBe(2);
  });

  it("returns 1 for emoji outside CJK ranges", () => {
    // U+1F600 GRINNING FACE — above U+2FA1F, so width 1
    expect(displayWidth("😀")).toBe(1);
  });

  it("handles mixed ASCII and CJK", () => {
    expect(displayWidth("aあb")).toBe(4); // 1 + 2 + 1
  });
});

describe("sliceByWidth", () => {
  it("slices ASCII string normally", () => {
    expect(sliceByWidth("hello", 3)).toBe("hel");
    expect(sliceByWidth("hello", 5)).toBe("hello");
    expect(sliceByWidth("hello", 10)).toBe("hello");
  });

  it("returns empty string when maxWidth is 0", () => {
    expect(sliceByWidth("hello", 0)).toBe("");
    expect(sliceByWidth("あいう", 0)).toBe("");
  });

  it("does not cut CJK character in half", () => {
    // "あ" is width 2 — maxWidth=1 cannot fit it, so result is ""
    expect(sliceByWidth("あ", 1)).toBe("");
    // maxWidth=2 fits exactly one CJK char
    expect(sliceByWidth("あ", 2)).toBe("あ");
  });

  it("stops before CJK char that would exceed maxWidth", () => {
    // "あいう" = 6 width; maxWidth=4 fits "あい" (4) but not "あいう" (6)
    expect(sliceByWidth("あいう", 4)).toBe("あい");
    // maxWidth=5 still only fits "あい" (4) because "う" would push to 6
    expect(sliceByWidth("あいう", 5)).toBe("あい");
  });

  it("handles mixed ASCII and CJK boundary", () => {
    // "aあb" = 1+2+1 = 4; maxWidth=3 should give "aあ" (3)? No: "a"=1, "あ"=2, total=3 ≤ 3 ✓
    expect(sliceByWidth("aあb", 3)).toBe("aあ");
    // maxWidth=2 gives "a" (1) then "あ" would be 3 > 2, so just "a"
    expect(sliceByWidth("aあb", 2)).toBe("a");
  });

  it("handles empty string", () => {
    expect(sliceByWidth("", 5)).toBe("");
  });
});

describe("buildDisplay", () => {
  it("returns value as-is when paste is null", () => {
    expect(buildDisplay("hello", null)).toBe("hello");
    expect(buildDisplay("", null)).toBe("");
    expect(buildDisplay("any string", null)).toBe("any string");
  });

  it("replaces pasted range with alias at start", () => {
    const paste: PasteRange = { start: 0, end: 5 };
    // "hello world" → "[5 chars pasted] world"
    expect(buildDisplay("hello world", paste)).toBe("[5 chars pasted] world");
  });

  it("replaces pasted range with alias in the middle", () => {
    const paste: PasteRange = { start: 3, end: 8 };
    // "abcXXXXXde" → "abc[5 chars pasted]de"
    expect(buildDisplay("abcXXXXXde", paste)).toBe("abc[5 chars pasted]de");
  });

  it("replaces pasted range with alias at end", () => {
    const paste: PasteRange = { start: 3, end: 6 };
    // "abcXXX" → "abc[3 chars pasted]"
    expect(buildDisplay("abcXXX", paste)).toBe("abc[3 chars pasted]");
  });

  it("uses pasteAlias format consistently", () => {
    const paste: PasteRange = { start: 0, end: 10 };
    expect(buildDisplay("0123456789", paste)).toBe(pasteAlias(10));
  });
});

describe("displayToReal / realToDisplay", () => {
  describe("without paste (null)", () => {
    it("is 1:1 mapping", () => {
      expect(displayToReal(0, "hello", null)).toBe(0);
      expect(displayToReal(3, "hello", null)).toBe(3);
      expect(displayToReal(5, "hello", null)).toBe(5);
      expect(realToDisplay(0, "hello", null)).toBe(0);
      expect(realToDisplay(3, "hello", null)).toBe(3);
      expect(realToDisplay(5, "hello", null)).toBe(5);
    });
  });

  describe("with paste", () => {
    // value = "abcXXXXXde" (paste range 3..8, alias = "[5 chars pasted]" = 16 chars)
    // display = "abc[5 chars pasted]de"
    //           0123456789...
    // aliasStart=3, aliasEnd=3+16=19
    const value = "abcXXXXXde";
    const paste: PasteRange = { start: 3, end: 8 };
    const aliasLen = pasteAlias(5).length; // "[5 chars pasted]".length = 16

    it("cursor before alias maps 1:1", () => {
      expect(displayToReal(0, value, paste)).toBe(0);
      expect(displayToReal(3, value, paste)).toBe(3);
      expect(realToDisplay(0, value, paste)).toBe(0);
      expect(realToDisplay(3, value, paste)).toBe(3);
    });

    it("displayToReal: cursor inside alias maps to paste.start", () => {
      // Any display cursor strictly inside alias (4..18) → paste.start = 3
      expect(displayToReal(4, value, paste)).toBe(3);
      expect(displayToReal(10, value, paste)).toBe(3);
      expect(displayToReal(aliasLen + 3 - 1, value, paste)).toBe(3);
    });

    it("displayToReal: cursor at alias end maps to paste.end", () => {
      // dCursor = aliasStart + aliasLen = 3 + 16 = 19 → paste.end = 8
      expect(displayToReal(3 + aliasLen, value, paste)).toBe(8);
    });

    it("displayToReal: cursor after alias is offset from paste.end", () => {
      // display 20 = aliasEnd(19) + 1 → real = paste.end(8) + 1 = 9
      expect(displayToReal(3 + aliasLen + 1, value, paste)).toBe(9);
      expect(displayToReal(3 + aliasLen + 2, value, paste)).toBe(10);
    });

    it("realToDisplay: real cursor inside paste maps to aliasEnd", () => {
      // rCursor=4 (inside paste 3..8) → paste.start + aliasLen = 19
      expect(realToDisplay(4, value, paste)).toBe(3 + aliasLen);
      expect(realToDisplay(8, value, paste)).toBe(3 + aliasLen);
    });

    it("realToDisplay: real cursor after paste is offset", () => {
      // rCursor=9 → aliasEnd(19) + (9-8) = 20
      expect(realToDisplay(9, value, paste)).toBe(3 + aliasLen + 1);
      expect(realToDisplay(10, value, paste)).toBe(3 + aliasLen + 2);
    });

    it("round-trip: realToDisplay(displayToReal(x)) === x for positions at alias boundaries", () => {
      // Before alias
      for (let d = 0; d <= 3; d++) {
        const r = displayToReal(d, value, paste);
        expect(realToDisplay(r, value, paste)).toBe(d);
      }
      // After alias
      for (let d = 3 + aliasLen; d <= 3 + aliasLen + 2; d++) {
        const r = displayToReal(d, value, paste);
        expect(realToDisplay(r, value, paste)).toBe(d);
      }
    });
  });
});
