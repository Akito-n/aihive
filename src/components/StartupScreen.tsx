import React, { useState, useEffect } from "react";
import { Box, Text } from "ink";

interface StartupScreenProps {
  onComplete: () => void;
}

const LOGO = [
  "   █████╗ ██╗██╗  ██╗██╗██╗   ██╗███████╗",
  "  ██╔══██╗██║██║  ██║██║██║   ██║██╔════╝",
  "  ███████║██║███████║██║██║   ██║█████╗  ",
  "  ██╔══██║██║██╔══██║██║╚██╗ ██╔╝██╔══╝  ",
  "  ██║  ██║██║██║  ██║██║ ╚████╔╝ ███████╗",
  "  ╚═╝  ╚═╝╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝  ╚══════╝",
];

const STEPS = [
  "Checking dependencies...",
  "Creating tmux session...",
  "Spawning Orchestrator...",
  "Spawning Coordinator...",
  "Spawning Workers...",
  "All agents ready.",
];

const BAR_WIDTH = 40;
const GLOW_RADIUS = 6;

export function StartupScreen({ onComplete }: StartupScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [logoVisible, setLogoVisible] = useState(false);
  const [tick, setTick] = useState(0);

  // Fade in logo
  useEffect(() => {
    const t = setTimeout(() => setLogoVisible(true), 200);
    return () => clearTimeout(t);
  }, []);

  // Step through the startup sequence
  useEffect(() => {
    if (currentStep >= STEPS.length) {
      const t = setTimeout(onComplete, 600);
      return () => clearTimeout(t);
    }
    const t = setTimeout(
      () => setCurrentStep((s) => s + 1),
      currentStep === 0 ? 500 : 400,
    );
    return () => clearTimeout(t);
  }, [currentStep, onComplete]);

  // Smooth animation tick (~30fps)
  useEffect(() => {
    if (currentStep >= STEPS.length) return;
    const interval = setInterval(() => setTick((t) => t + 1), 33);
    return () => clearInterval(interval);
  }, [currentStep]);

  // Smooth progress with easing between steps
  const [smoothProgress, setSmoothProgress] = useState(0);
  useEffect(() => {
    const target = Math.min(currentStep / STEPS.length, 1);
    const interval = setInterval(() => {
      setSmoothProgress((prev) => {
        const diff = target - prev;
        if (Math.abs(diff) < 0.002) return target;
        return prev + diff * 0.12;
      });
    }, 33);
    return () => clearInterval(interval);
  }, [currentStep]);

  const filled = Math.round(smoothProgress * BAR_WIDTH);
  // Sine-based glow that sweeps across the bar
  const glowCenter = (tick * 0.6) % (BAR_WIDTH + GLOW_RADIUS * 2) - GLOW_RADIUS;

  const FILL_CHARS = ["░", "▒", "▓", "█"];

  const renderBar = () => {
    const chars: { char: string; color: string }[] = [];
    for (let i = 0; i < BAR_WIDTH; i++) {
      const dist = Math.abs(i - glowCenter);
      const glow = Math.max(0, 1 - dist / GLOW_RADIUS);

      if (i < filled) {
        // Filled portion: cycle through block chars based on glow
        const charIdx = Math.min(3, 3 + Math.round(glow * 0));
        chars.push({
          char: FILL_CHARS[charIdx],
          color: glow > 0.5 ? "whiteBright" : glow > 0.2 ? "cyanBright" : "cyan",
        });
      } else if (i === filled) {
        // Leading edge: partial fill
        const edgeGlow = glow > 0.3;
        chars.push({ char: "▓", color: edgeGlow ? "cyanBright" : "cyan" });
      } else {
        // Empty portion: subtle shimmer
        chars.push({
          char: glow > 0.6 ? "▒" : glow > 0.3 ? "░" : "·",
          color: glow > 0.6 ? "gray" : glow > 0.3 ? "blackBright" : "blackBright",
        });
      }
    }
    return chars;
  };

  return (
    <Box flexDirection="column" alignItems="center" paddingY={2}>
      {/* Logo */}
      {logoVisible && (
        <Box flexDirection="column" marginBottom={1}>
          {LOGO.map((line, i) => (
            <Text key={`logo-${i}`} color="cyan" bold>
              {line}
            </Text>
          ))}
        </Box>
      )}

      {/* Version */}
      <Text dimColor>v0.1.0</Text>

      {/* Progress steps */}
      <Box flexDirection="column" marginTop={1} paddingX={6}>
        {STEPS.map((step, i) => {
          if (i > currentStep) return null;

          const isDone = i < currentStep;
          const isCurrent = i === currentStep;
          const isLast = i === STEPS.length - 1;

          return (
            <Box key={`step-${i}`} gap={1}>
              <Text color={isDone ? "green" : isCurrent ? "yellow" : "gray"}>
                {isDone ? "✓" : isCurrent ? "◌" : " "}
              </Text>
              <Text
                color={
                  isLast && isDone
                    ? "green"
                    : isDone
                      ? "gray"
                      : isCurrent
                        ? "white"
                        : "gray"
                }
                bold={isCurrent || (isLast && isDone)}
              >
                {step}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Animated progress bar */}
      {currentStep < STEPS.length && (
        <Box marginTop={1}>
          <Text color="gray">{"["}</Text>
          {renderBar().map((c, i) => (
            <Text key={`bar-${i}`} color={c.color}>
              {c.char}
            </Text>
          ))}
          <Text color="gray">{"]"}</Text>
          <Text color="cyan"> {Math.round(smoothProgress * 100)}%</Text>
        </Box>
      )}

      {/* Completion bar */}
      {currentStep >= STEPS.length && (
        <Box marginTop={1}>
          <Text color="gray">{"["}</Text>
          <Text color="green">{"█".repeat(BAR_WIDTH)}</Text>
          <Text color="gray">{"]"}</Text>
          <Text color="green" bold> 100%</Text>
        </Box>
      )}
    </Box>
  );
}
