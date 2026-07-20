import type { LogConfig } from "@supervisor/core/config";
import * as Logger from "@supervisor/core/logger";
import pino from "pino";

const pinoTransport = (config: LogConfig): Logger.Transport => {
  const targets: pino.TransportTargetOptions[] = [];

  if (config.path) {
    targets.push({ target: "pino/file", options: { destination: config.path, mkdir: true }, level: config.level });
  }

  const logger = pino({ level: config.level }, config.path ? pino.transport({ targets }) : pino.destination(1));

  return (record) => {
    const fn = logger[record.level as "debug" | "info" | "warn" | "error"] as pino.LogFn;
    fn?.(record.tag ? { tag: record.tag, depth: record.depth } : {}, record.message);
  };
};

export const create = (config: LogConfig, extraTransports: readonly Logger.Transport[] = []): Logger.Tagged => {
  const transports: Logger.Transport[] = [Logger.consoleTransport, ...extraTransports];

  if (config.path) {
    transports.push(pinoTransport(config));
  }

  return Logger.create(config.level as Logger.LogLevel, transports);
};
