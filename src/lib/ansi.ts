import { Text } from "ink";
import React from "react";

export interface AnsiSpan {
  text: string;
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
}

// Standard ANSI 16-color palette
const ANSI_COLORS: Record<number, string> = {
  30: "black",
  31: "red",
  32: "green",
  33: "yellow",
  34: "blue",
  35: "magenta",
  36: "cyan",
  37: "white",
  // Bright colors
  90: "gray",
  91: "redBright",
  92: "greenBright",
  93: "yellowBright",
  94: "blueBright",
  95: "magentaBright",
  96: "cyanBright",
  97: "whiteBright",
};

const ANSI_BG_COLORS: Record<number, string> = {
  40: "black",
  41: "red",
  42: "green",
  43: "yellow",
  44: "blue",
  45: "magenta",
  46: "cyan",
  47: "white",
  100: "gray",
  101: "redBright",
  102: "greenBright",
  103: "yellowBright",
  104: "blueBright",
  105: "magentaBright",
  106: "cyanBright",
  107: "whiteBright",
};

// 256-color to hex lookup for the 6x6x6 cube (indices 16-231)
function color256ToHex(n: number): string {
  if (n < 16) {
    // Standard colors - map to names
    const map: Record<number, string> = {
      0: "#000000",
      1: "#aa0000",
      2: "#00aa00",
      3: "#aa5500",
      4: "#0000aa",
      5: "#aa00aa",
      6: "#00aaaa",
      7: "#aaaaaa",
      8: "#555555",
      9: "#ff5555",
      10: "#55ff55",
      11: "#ffff55",
      12: "#5555ff",
      13: "#ff55ff",
      14: "#55ffff",
      15: "#ffffff",
    };
    return map[n] ?? "#ffffff";
  }
  if (n < 232) {
    // 6x6x6 color cube
    const idx = n - 16;
    const r = Math.floor(idx / 36);
    const g = Math.floor((idx % 36) / 6);
    const b = idx % 6;
    const toHex = (v: number) => (v === 0 ? 0 : 55 + v * 40);
    return `#${toHex(r).toString(16).padStart(2, "0")}${toHex(g).toString(16).padStart(2, "0")}${toHex(b).toString(16).padStart(2, "0")}`;
  }
  // Grayscale ramp (232-255)
  const level = 8 + (n - 232) * 10;
  const hex = level.toString(16).padStart(2, "0");
  return `#${hex}${hex}${hex}`;
}

interface AnsiState {
  fg?: string;
  bg?: string;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  inverse?: boolean;
  strikethrough?: boolean;
}

function applyParams(state: AnsiState, params: number[]): void {
  let i = 0;
  while (i < params.length) {
    const p = params[i];
    if (p === 0) {
      // Reset
      state.fg = undefined;
      state.bg = undefined;
      state.bold = undefined;
      state.dim = undefined;
      state.italic = undefined;
      state.underline = undefined;
      state.inverse = undefined;
      state.strikethrough = undefined;
    } else if (p === 1) {
      state.bold = true;
    } else if (p === 2) {
      state.dim = true;
    } else if (p === 3) {
      state.italic = true;
    } else if (p === 4) {
      state.underline = true;
    } else if (p === 7) {
      state.inverse = true;
    } else if (p === 9) {
      state.strikethrough = true;
    } else if (p === 22) {
      state.bold = undefined;
      state.dim = undefined;
    } else if (p === 23) {
      state.italic = undefined;
    } else if (p === 24) {
      state.underline = undefined;
    } else if (p === 27) {
      state.inverse = undefined;
    } else if (p === 29) {
      state.strikethrough = undefined;
    } else if (p >= 30 && p <= 37) {
      state.fg = ANSI_COLORS[p];
    } else if (p === 38) {
      // Extended foreground
      if (params[i + 1] === 5 && i + 2 < params.length) {
        state.fg = color256ToHex(params[i + 2]);
        i += 2;
      } else if (params[i + 1] === 2 && i + 4 < params.length) {
        const r = params[i + 2];
        const g = params[i + 3];
        const b = params[i + 4];
        state.fg = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        i += 4;
      }
    } else if (p === 39) {
      state.fg = undefined;
    } else if (p >= 40 && p <= 47) {
      state.bg = ANSI_BG_COLORS[p];
    } else if (p === 48) {
      // Extended background
      if (params[i + 1] === 5 && i + 2 < params.length) {
        state.bg = color256ToHex(params[i + 2]);
        i += 2;
      } else if (params[i + 1] === 2 && i + 4 < params.length) {
        const r = params[i + 2];
        const g = params[i + 3];
        const b = params[i + 4];
        state.bg = `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
        i += 4;
      }
    } else if (p === 49) {
      state.bg = undefined;
    } else if (p >= 90 && p <= 97) {
      state.fg = ANSI_COLORS[p];
    } else if (p >= 100 && p <= 107) {
      state.bg = ANSI_BG_COLORS[p];
    }
    i++;
  }
}

/** Parse a string with ANSI escape sequences into styled spans */
export function parseAnsi(text: string): AnsiSpan[] {
  const spans: AnsiSpan[] = [];
  const state: AnsiState = {};

  // Match ANSI CSI sequences: ESC[ ... m
  // Also strip other CSI sequences (cursor movement, etc.)
  const regex = /\x1b\[([0-9;]*)([A-Za-z])/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    // Text before this escape
    if (match.index > lastIndex) {
      const chunk = text.slice(lastIndex, match.index);
      if (chunk.length > 0) {
        spans.push({ text: chunk, ...state });
      }
    }
    lastIndex = regex.lastIndex;

    const code = match[2];
    if (code === "m") {
      // SGR (Select Graphic Rendition)
      const paramStr = match[1] || "0";
      const params = paramStr.split(";").map(Number);
      applyParams(state, params);
    }
    // Other CSI codes (cursor movement etc.) are silently discarded
  }

  // Remaining text after last escape
  if (lastIndex < text.length) {
    const chunk = text.slice(lastIndex);
    if (chunk.length > 0) {
      spans.push({ text: chunk, ...state });
    }
  }

  return spans;
}

/** Strip ANSI escape sequences from text (for plain text operations like prompt detection) */
export function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "");
}

/** Create React elements from ANSI spans */
export function ansiToElements(
  spans: AnsiSpan[],
  keyPrefix: string,
): React.ReactNode[] {
  return spans.map((span, i) => {
    const props: Record<string, unknown> = { key: `${keyPrefix}-${i}` };
    if (span.fg) props.color = span.fg;
    if (span.bg) props.backgroundColor = span.bg;
    if (span.bold) props.bold = true;
    if (span.dim) props.dimColor = true;
    if (span.italic) props.italic = true;
    if (span.underline) props.underline = true;
    if (span.inverse) props.inverse = true;
    if (span.strikethrough) props.strikethrough = true;

    return React.createElement(Text, props, span.text);
  });
}
