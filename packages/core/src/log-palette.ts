// -------------------------------------------------------------------------------------
// Log color palette
//
// Colors are plain data (ANSI code + hex), never baked into log text. Terminal
// transports render `ansi`, the web UI renders `hex` — both read the same index.
// Zero dependencies so it's safe to import from browser bundles.
// -------------------------------------------------------------------------------------

export interface LogColor {
  readonly ansi: string;
  readonly hex: string;
}

export const ANSI_RESET = "\x1b[0m";

// Assigned to tags in rotation (see getModuleColor in logger.ts)
export const TAG_PALETTE: readonly LogColor[] = [
  { ansi: "\x1b[32m", hex: "#3fb950" }, // green
  { ansi: "\x1b[33m", hex: "#d29922" }, // yellow
  { ansi: "\x1b[34m", hex: "#58a6ff" }, // blue
  { ansi: "\x1b[35m", hex: "#bc8cff" }, // magenta
  { ansi: "\x1b[36m", hex: "#39c5cf" }, // cyan
  { ansi: "\x1b[91m", hex: "#ff7b72" }, // bright red
  { ansi: "\x1b[92m", hex: "#56d364" }, // bright green
  { ansi: "\x1b[93m", hex: "#e3b341" }, // bright yellow
  { ansi: "\x1b[94m", hex: "#79c0ff" }, // bright blue
  { ansi: "\x1b[95m", hex: "#d2a8ff" }, // bright magenta
  { ansi: "\x1b[96m", hex: "#56d4dd" }, // bright cyan
];

export const LEVEL_PALETTE: Record<string, LogColor> = {
  fatal: { ansi: "\x1b[41m\x1b[37m", hex: "#ff6b6b" },
  error: { ansi: "\x1b[31m", hex: "#ff6b6b" },
  warn: { ansi: "\x1b[33m", hex: "#e3b341" },
  info: { ansi: "\x1b[36m", hex: "#79c0ff" },
  debug: { ansi: "\x1b[90m", hex: "#8b949e" },
  trace: { ansi: "\x1b[90m", hex: "#8b949e" },
};
