import type { Logger } from "@supervisor/core/logger";
import {
  CameraEntryCodec,
  CameraUpdateInputCodec,
  ControlUnitEntryCodec,
  ControlUnitUpdateInputCodec,
  TvEntryCodec,
  TvUpdateInputCodec,
} from "@supervisor/core/services/device-registry/device-registry";
import type { Services } from "@supervisor/core/services/services";
import * as Socket from "@supervisor/core/socket";
import { initTRPC } from "@trpc/server";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import * as T from "io-ts";
import { PathReporter } from "io-ts/PathReporter";
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
  t.middleware(async ({ path, type, input, next, ctx, meta }) => {
    const endpoint = `${type} ${path} ${input || meta ? JSON.stringify({ input, meta }) : ""}`.trim();

    ctx.logger.info(`-> ${endpoint}`)();

    const start = Date.now();
    const result = await next();
    const ms = Date.now() - start;

    if (result.ok) {
      ctx.logger.info(`<- ${endpoint} <- OK (${ms}ms)`)();
    } else {
      ctx.logger.error(`<- ${endpoint} <- ERROR (${ms}ms)`)();
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
// Device Registry router
// -------------------------------------------------------------------------------------

const decodeOrThrow =
  <A>(codec: { decode: (u: unknown) => E.Either<import("io-ts").Errors, A> }) =>
  (value: unknown): A =>
    pipe(
      codec.decode(value),
      E.getOrElse<import("io-ts").Errors, A>((errors) => {
        throw new Error(PathReporter.report(E.left(errors)).join("; "));
      }),
    );

const controlUnitsRouter = router({
  update: publicProcedure
    .input(decodeOrThrow(ControlUnitUpdateInputCodec))
    .mutation(({ ctx, input }) =>
      pipe(ctx.services.registry.controlUnits.update(input.id, input), Result.fromTaskEither),
    ),

  add: publicProcedure
    .input(decodeOrThrow(ControlUnitEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.controlUnits.add(input), Result.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.controlUnits.remove(input), Result.fromTaskEither)),
});

const camerasRouter = router({
  update: publicProcedure
    .input(decodeOrThrow(CameraUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.update(input.ip, input), Result.fromTaskEither)),

  add: publicProcedure
    .input(decodeOrThrow(CameraEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.add(input), Result.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.remove(input), Result.fromTaskEither)),
});

const tvsRouter = router({
  update: publicProcedure
    .input(decodeOrThrow(TvUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.update(input.ip, input), Result.fromTaskEither)),

  add: publicProcedure
    .input(decodeOrThrow(TvEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.add(input), Result.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.remove(input), Result.fromTaskEither)),
});

const registryRouter = router({
  getAll: publicProcedure.query(({ ctx }) => pipe(ctx.services.registry.getAll(), Result.fromTaskEither)),
  controlUnits: controlUnitsRouter,
  cameras: camerasRouter,
  tvs: tvsRouter,
});

// -------------------------------------------------------------------------------------
// Main App Router
// -------------------------------------------------------------------------------------

export const appRouter = router({
  android: androidRouter,
  registry: registryRouter,
});

export type AppRouter = typeof appRouter;
