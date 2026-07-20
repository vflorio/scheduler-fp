import type { LogEntry } from "@supervisor/core/log-stream";
import type { TrackedEnvelope } from "@trpc/server";
import { tracked } from "@trpc/server";
import { publicProcedure, router } from "../instance";

// -------------------------------------------------------------------------------------
// Logs router (live tail, SSE-based subscription)
// -------------------------------------------------------------------------------------

export interface LogTailInput {
  readonly lastEventId?: string;
}

const logTailInput = (value: unknown): LogTailInput => {
  if (value == null) return {};
  if (typeof value !== "object") throw new Error("Expected log tail input to be an object");

  const lastEventId = (value as Record<string, unknown>).lastEventId;
  if (lastEventId != null && typeof lastEventId !== "string") {
    throw new Error("Expected lastEventId to be a string");
  }

  return { lastEventId: lastEventId ?? undefined };
};

// Quante righe di backlog inviare a un client che si collega per la prima volta (senza lastEventId)
const HISTORY_REPLAY_SIZE = 200;

export const logsRouter = router({
  tail: publicProcedure.input(logTailInput).subscription(async function* ({
    ctx,
    input,
    signal,
  }): AsyncGenerator<TrackedEnvelope<LogEntry>> {
    const abortSignal = signal ?? new AbortController().signal;
    const feed = ctx.services.logs;
    const history = feed.history();

    const startIndex = input.lastEventId
      ? history.findIndex((entry) => String(entry.id) === input.lastEventId) + 1
      : Math.max(0, history.length - HISTORY_REPLAY_SIZE);

    for (const entry of history.slice(startIndex)) {
      yield tracked(String(entry.id), entry);
    }

    const queue: LogEntry[] = [];
    let wake: (() => void) | null = null;

    const unsubscribe = feed.subscribe((entry) => {
      queue.push(entry);
      wake?.();
    });

    abortSignal.addEventListener("abort", () => wake?.(), { once: true });

    try {
      while (!abortSignal.aborted) {
        if (queue.length === 0) {
          await new Promise<void>((resolve) => {
            wake = resolve;
          });
        }

        while (queue.length > 0) {
          const entry = queue.shift();
          if (entry) yield tracked(String(entry.id), entry);
        }
      }
    } finally {
      unsubscribe();
    }
  }),
});
