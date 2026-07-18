import type { LogConfig } from "@supervisor/core/config";
import {
  consoleTransport,
  createLogger,
  type Logger,
  type LogLevel,
  stripAnsi,
  type Transport,
} from "@supervisor/core/logger";
import pino from "pino";

const pinoTransport = (config: LogConfig): Transport => {
  const targets: pino.TransportTargetOptions[] = [];

  if (config.path) {
    targets.push({ target: "pino/file", options: { destination: config.path, mkdir: true }, level: config.level });
  }

  const logger = pino({ level: config.level }, config.path ? pino.transport({ targets }) : pino.destination(1));

  return (level, message) => {
    const clean = stripAnsi(message);
    (logger[level as "debug" | "info" | "warn" | "error"] as pino.LogFn)?.(clean);
  };
};

export const create = (config: LogConfig): Logger => {
  const transports: Transport[] = [consoleTransport];

  if (config.path) {
    transports.push(pinoTransport(config));
  }

  return createLogger(config.level as LogLevel, transports);
};
