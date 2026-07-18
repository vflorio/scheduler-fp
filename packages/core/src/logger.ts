import type * as IO from "fp-ts/IO";
import * as t from "io-ts";

export interface Logger {
  readonly debug: (message: string) => IO.IO<void>;
  readonly info: (message: string) => IO.IO<void>;
  readonly warn: (message: string) => IO.IO<void>;
  readonly error: (message: string) => IO.IO<void>;
}

// -------------------------------------------------------------------------------------
// Log levels
// -------------------------------------------------------------------------------------

// Configurazione logging
export const LogLevel = t.keyof({
  fatal: null,
  error: null,
  warn: null,
  info: null,
  debug: null,
  trace: null,
  silent: null,
});

export type LogLevel = t.TypeOf<typeof LogLevel>;

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  fatal: 60,
  error: 50,
  warn: 40,
  info: 30,
  debug: 20,
  trace: 10,
  silent: Infinity,
};

export const isLevelEnabled = (configured: LogLevel, target: LogLevel): boolean =>
  (LEVEL_PRIORITY[target] ?? 0) >= LEVEL_PRIORITY[configured];

// -------------------------------------------------------------------------------------
// ANSI utilities
// -------------------------------------------------------------------------------------

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;

export const stripAnsi = (str: string): string => str.replace(ANSI_REGEX, "");

// -------------------------------------------------------------------------------------
// Level colors
// -------------------------------------------------------------------------------------

const LEVEL_COLORS: Record<string, string> = {
  fatal: "\x1b[41m\x1b[37m",
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[36m",
  debug: "\x1b[90m",
  trace: "\x1b[90m",
};

// -------------------------------------------------------------------------------------
// Tag colors (per-module coloring)
// -------------------------------------------------------------------------------------

const TAG_COLORS = [
  "\x1b[32m", // green
  "\x1b[33m", // yellow
  "\x1b[34m", // blue
  "\x1b[35m", // magenta
  "\x1b[36m", // cyan
  "\x1b[91m", // bright red
  "\x1b[92m", // bright green
  "\x1b[93m", // bright yellow
  "\x1b[94m", // bright blue
  "\x1b[95m", // bright magenta
  "\x1b[96m", // bright cyan
] as const;

const RESET = "\x1b[0m";
const INDENT_SIZE = 2;

let colorIndex = 0;
const moduleColorMap = new Map<string, string>();

const getModuleColor = (tag: string): string => {
  const existing = moduleColorMap.get(tag);
  if (existing) return existing;

  const color = TAG_COLORS[colorIndex % TAG_COLORS.length] ?? RESET;

  colorIndex++;
  moduleColorMap.set(tag, color);

  return color;
};

// -------------------------------------------------------------------------------------
// Formatting utilities
// -------------------------------------------------------------------------------------

export const colorizeLevel = (level: string, msg: string): string => {
  const color = LEVEL_COLORS[level] ?? "";
  return `${color}${msg}${RESET}`;
};

export const formatTagPrefix = (tag: string, depth: number): string => {
  const color = getModuleColor(tag);
  const indent = " ".repeat(depth * INDENT_SIZE);
  return `${indent}${color}[${tag}]${RESET} `;
};

// -------------------------------------------------------------------------------------
// TaggedLogger [TAG] ...message
// -------------------------------------------------------------------------------------

export interface Tagged extends Logger {
  readonly child: (tag: string) => Tagged;
}

export const tagged = (base: Logger, tag: string, depth = 0): Tagged => {
  const prefix = formatTagPrefix(tag, depth);

  const wrap =
    (log: (message: string) => IO.IO<void>) =>
    (message: string): IO.IO<void> =>
      log(`${prefix}${message}`);

  return {
    debug: wrap(base.debug),
    info: wrap(base.info),
    warn: wrap(base.warn),
    error: wrap(base.error),
    child: (childTag: string) => tagged(base, childTag, depth + 1),
  };
};

// -------------------------------------------------------------------------------------
// Generic logger factory
// -------------------------------------------------------------------------------------

export type Transport = (level: LogLevel, message: string) => void;

export const createLogger = (level: LogLevel, transports: readonly Transport[]): Logger => {
  const write =
    (lvl: LogLevel) =>
    (message: string): IO.IO<void> =>
    () => {
      if (isLevelEnabled(level, lvl)) {
        for (const t of transports) t(lvl, message);
      }
    };

  return {
    debug: write("debug"),
    info: write("info"),
    warn: write("warn"),
    error: write("error"),
  };
};

// -------------------------------------------------------------------------------------
// Built-in transports
// -------------------------------------------------------------------------------------

export const consoleTransport: Transport = (level, message) => {
  console.log(colorizeLevel(level, message));
};

export const stdoutTransport: Transport = (level, message) => {
  (globalThis as any).process?.stdout?.write(`${colorizeLevel(level, message)}\n`);
};

// -------------------------------------------------------------------------------------
// Console logger (convenience, no dependencies)
// -------------------------------------------------------------------------------------

export const createConsoleLogger = (level: LogLevel = "info"): Logger => createLogger(level, [consoleTransport]);
export const createStdoutLogger = (level: LogLevel = "info"): Logger => createLogger(level, [stdoutTransport]);
