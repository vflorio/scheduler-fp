import { type LogLevel, stripAnsi, type Transport } from "./logger";

// -------------------------------------------------------------------------------------
// In-memory log broadcast (console-formatted lines -> live subscribers)
// -------------------------------------------------------------------------------------

export interface LogEntry {
  readonly id: number;
  readonly timestamp: number;
  readonly level: LogLevel;
  readonly message: string;
}

export interface LogFeed {
  readonly subscribe: (listener: (entry: LogEntry) => void) => () => void;
  readonly history: () => readonly LogEntry[];
}

export interface LogStream extends LogFeed {
  readonly transport: Transport;
}

export const createLogStream = (bufferSize = 500): LogStream => {
  const buffer: LogEntry[] = [];
  const listeners = new Set<(entry: LogEntry) => void>();
  let nextId = 0;

  const transport: Transport = (level, message) => {
    const entry: LogEntry = { id: nextId++, timestamp: Date.now(), level, message: stripAnsi(message) };

    buffer.push(entry);
    if (buffer.length > bufferSize) buffer.shift();

    for (const listener of listeners) listener(entry);
  };

  return {
    transport,
    history: () => buffer.slice(),
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};
