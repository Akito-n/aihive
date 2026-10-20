import { Box, Text } from "ink";
import { logoColors } from "../lib/theme.js";

/** 7-row pixel glyphs for the title; "#" is a lit pixel */
const GLYPHS: Record<string, string[]> = {
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  E: ["####", "#   ", "#   ", "### ", "#   ", "#   ", "####"],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["###", " # ", " # ", " # ", " # ", " # ", "###"],
  V: ["#   #", "#   #", "#   #", "#   #", " # # ", " # # ", "  #  "],
};

/** Text drawn as square pixels: each pixel is two full blocks wide */
export function pixelLines(text: string): string[] {
  const glyphs = [...text.toUpperCase()].map((ch) => GLYPHS[ch]);
  if (glyphs.some((g) => !g)) throw new Error(`no pixel glyph in "${text}"`);
  return GLYPHS.A.map((_, row) =>
    glyphs
      .map((g) => g[row].replace(/#/g, "██").replace(/ /g, "  "))
      .join("  ")
      .trimEnd(),
  );
}

const LOGO = pixelLines("aihive");
/** Lighter at the top, like a lit sign */
const ROW_COLORS = [
  "yellowBright",
  "yellowBright",
  "yellowBright",
  "yellow",
  "yellow",
  "yellow",
  "yellow",
];

export function PixelLogo() {
  const colors = logoColors() ?? ROW_COLORS;
  return (
    <Box flexDirection="column">
      {LOGO.map((line, i) => (
        <Text key={colors[i] + String(i)} color={colors[i]} bold>
          {line}
        </Text>
      ))}
    </Box>
  );
}
