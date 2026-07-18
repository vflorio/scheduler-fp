import { Target } from "@supervisor/core/adb";
import { initTRPC } from "@trpc/server";
import { pipe } from "fp-ts/lib/function";
import type { Context } from "./context";
import * as Result from "./result";

export type { Context, Services } from "./context";
export { type ApiResult, fail, fromTaskEither, ok, type TaggedError } from "./result";

/**
 * Initialization of tRPC backend
 * Should be done only once per backend!
 */
export const t = initTRPC.context<Context>().create();

/**
 * Export reusable router and procedure helpers
 * that can be used throughout the router
 */
export const router = t.router;
export const publicProcedure = t.procedure;

// -------------------------------------------------------------------------------------
// Android Bridge router
// -------------------------------------------------------------------------------------

const targetInput = (value: unknown): string => {
  if (Target.is(value)) return value;
  throw new Error("Expected ADB target in <host>:<port> format");
};

export const androidRouter = router({
  devices: publicProcedure.query(({ ctx }) => pipe(ctx.services.android.devices(), Result.fromTaskEither)),
  reboot: publicProcedure
    .input(targetInput)
    .mutation(({ ctx, input }) =>
      pipe(ctx.services.android.reboot(input as `${string}:${number}`), Result.fromTaskEither),
    ),
});

export const appRouter = router({
  android: androidRouter,
});

export type AppRouter = typeof appRouter;
