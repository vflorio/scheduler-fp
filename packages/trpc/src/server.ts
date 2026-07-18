import type { Logger } from "@supervisor/core/logger";
import type { Services } from "@supervisor/core/services";
import * as Socket from "@supervisor/core/socket";
import { initTRPC } from "@trpc/server";
import { pipe } from "fp-ts/lib/function";
import * as Result from "./result";

export * from "./result";

export interface Context {
  readonly services: Services;
  readonly logger: Logger;
  readonly isLocalhost: boolean;
}

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

const loggedProcedure = t.procedure.use(
  t.middleware(async ({ path, type, next, ctx }) => {
    ctx.logger.info(`-> ${type} ${path}`)();
    const start = Date.now();
    const result = await next();
    const ms = Date.now() - start;

    if (result.ok) {
      ctx.logger.info(`<- ${type} ${path} OK (${ms}ms)`)();
    } else {
      ctx.logger.error(`<- ${type} ${path} ERROR (${ms}ms)`)();
    }

    return result;
  }),
);

export const publicProcedure = loggedProcedure;

// -------------------------------------------------------------------------------------
// Android Bridge router
// -------------------------------------------------------------------------------------

const targetInput = (value: unknown): Socket.IPv4 => {
  if (Socket.Codec.is(value)) return value;
  throw new Error("Expected ADB target in <host>:<port> format");
};

const androidRouter = router({
  devices: publicProcedure.query(({ ctx }) => pipe(ctx.services.android.devices(), Result.fromTaskEither)),
  reboot: publicProcedure
    .input(targetInput)
    .mutation(({ ctx, input }) => pipe(ctx.services.android.reboot(input), Result.fromTaskEither)),
});

// -------------------------------------------------------------------------------------
// Main App router
// -------------------------------------------------------------------------------------
export const appRouter = router({
  android: androidRouter,
});

export type AppRouter = typeof appRouter;
