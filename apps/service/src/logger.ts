import type { LogConfig } from "@supervisor/core/config";
import type { Logger } from "@supervisor/core/logger";
import { type TaggedLogger, tagged } from "@supervisor/core/logger";
import type * as IO from "fp-ts/IO";
import pino from "pino";

export type { Logger, TaggedLogger };
export { tagged };

const levelColors: Record<string, string> = {
  fatal: "\x1b[41m\x1b[37m",
  error: "\x1b[31m",
  warn: "\x1b[33m",
  info: "\x1b[36m",
  debug: "\x1b[90m",
  trace: "\x1b[90m",
};
const reset = "\x1b[0m";

const colorize = (level: string, msg: string): string => {
  const color = levelColors[level] ?? "";
  return `${color}${msg}${reset}`;
};

export const create = (config: LogConfig): Logger => {
  const targets: pino.TransportTargetOptions[] = [];

  if (config.path) {
    targets.push({ target: "pino/file", options: { destination: config.path, mkdir: true }, level: config.level });
  }

  const p = pino(
    {
      level: config.level,
      ...(targets.length > 0 ? { transport: { targets } } : {}),
    },
    targets.length === 0 ? pino.destination(1) : undefined!,
  );

  // Console writer: colored msg only
  const write = (level: string, message: string): void => {
    const line = colorize(level, message);
    process.stdout.write(`${line}\n`);
  };

  return {
    debug:
      (message: string): IO.IO<void> =>
      () => {
        if (config.path) p.debug(message);
        if (p.isLevelEnabled("debug")) write("debug", message);
      },
    info:
      (message: string): IO.IO<void> =>
      () => {
        if (config.path) p.info(message);
        write("info", message);
      },
    warn:
      (message: string): IO.IO<void> =>
      () => {
        if (config.path) p.warn(message);
        write("warn", message);
      },
    error:
      (message: string): IO.IO<void> =>
      () => {
        if (config.path) p.error(message);
        write("error", message);
      },
  };
};
