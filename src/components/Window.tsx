import { Box, type BoxProps, Text } from "ink";
import type React from "react";
import { useEffect, useState } from "react";
import { frameStyle } from "../lib/theme.js";

interface WindowProps extends Omit<BoxProps, "borderStyle" | "borderColor"> {
  /** Shown on the top border, like an RPG window's name */
  title?: string;
  titleColor?: string;
  active?: boolean;
  children?: React.ReactNode;
}

/** A framed window in the current theme's style, with its title on the border */
export function Window({
  title,
  titleColor,
  active = false,
  children,
  overflow,
  ...box
}: WindowProps) {
  return (
    <Box flexDirection="column" paddingX={1} {...frameStyle(active)} {...box}>
      {title && (
        <Box position="absolute" top={-1} left={1}>
          <Text bold color={titleColor}>
            {` ${title} `}
          </Text>
        </Box>
      )}
      {/* Clip inside the frame, so the title on the border stays visible */}
      <Box flexDirection="column" flexGrow={1} overflow={overflow}>
        {children}
      </Box>
    </Box>
  );
}

/** Toggles on a fixed beat, for a blinking cursor */
export function useBlink(ms = 500): boolean {
  const [on, setOn] = useState(true);
  useEffect(() => {
    const timer = setInterval(() => setOn((v) => !v), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return on;
}
