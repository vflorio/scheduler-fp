import type * as IO from "fp-ts/IO";

export interface Logger {
  readonly debug: (message: string) => IO.IO<void>;
  readonly info: (message: string) => IO.IO<void>;
  readonly warn: (message: string) => IO.IO<void>;
  readonly error: (message: string) => IO.IO<void>;
}

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

  const color = TAG_COLORS[colorIndex % TAG_COLORS.length];

  colorIndex++;
  moduleColorMap.set(tag, color);

  return color;
};

export interface TaggedLogger extends Logger {
  // Crea un logger indentato e prefissato
  readonly child: (tag: string) => TaggedLogger;
}

export const tagged = (base: Logger, tag: string, depth = 0): TaggedLogger => {
  const color = getModuleColor(tag);
  const indent = " ".repeat(depth * INDENT_SIZE);
  const prefix = `${indent}${color}[${tag}]${RESET} `;

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
