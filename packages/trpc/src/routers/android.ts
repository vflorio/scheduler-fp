import * as Errors from "@supervisor/core/errors";
import * as Socket from "@supervisor/core/socket";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import { publicProcedure, router } from "../instance";
import * as Result from "../result";

// -------------------------------------------------------------------------------------
// Android router (ADB device management, live tail, SSE-based subscription)
// -------------------------------------------------------------------------------------

const targetInput = (value: unknown): Socket.IPv4 => {
  if (Socket.Codec.is(value)) return value;
  throw new Error("Expected ADB target in <host>:<port> format");
};

// `adb` non espone un meccanismo di push/evento nativo: lo stato viene osservato via polling
const ADB_POLL_INTERVAL_MS = 2000;

export const androidRouter = router({
  devices: publicProcedure.query(({ ctx }) => pipe(ctx.services.android.devices(), Result.fromTaskEither)),

  reboot: publicProcedure
    .input(targetInput)
    .mutation(({ ctx, input }) => pipe(ctx.services.android.reboot(input), Result.fromTaskEither)),

  // Live tail dello stato ADB degli host (raggiungibilità fisica del device, non l'app suitest-camera)
  devicesTail: publicProcedure.subscription(async function* ({
    ctx,
    signal,
  }): AsyncGenerator<readonly { target: string; status: string }[]> {
    // https://trpc.io/docs/server/subscriptions#pull-data-in-a-loop

    const abortSignal = signal ?? new AbortController().signal;
    let previous: string | undefined;

    while (!abortSignal.aborted) {
      const result = await ctx.services.android.devices()();

      if (E.isRight(result)) {
        const snapshot = JSON.stringify(result.right);
        if (snapshot !== previous) {
          previous = snapshot;
          yield result.right;
        }
      } else {
        ctx.logger.error(`android.devicesTail poll failed: ${Errors.format(result.left)}`)();
      }

      await new Promise<void>((resolve) => {
        const timer = setTimeout(resolve, ADB_POLL_INTERVAL_MS);
        abortSignal.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            resolve();
          },
          { once: true },
        );
      });
    }
  }),
});
