import {
  CameraEntryCodec,
  CameraUpdateInputCodec,
  ControlUnitEntryCodec,
  ControlUnitUpdateInputCodec,
  TvEntryCodec,
  TvUpdateInputCodec,
} from "@supervisor/core/services/db";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/lib/function";
import type { Errors } from "io-ts";
import * as T from "io-ts";
import { PathReporter } from "io-ts/PathReporter";
import { publicProcedure, router } from "../instance";
import * as ApiResult from "../result";

// -------------------------------------------------------------------------------------
// Device Registry router (CRUD for cameras, control units, TVs)
// -------------------------------------------------------------------------------------

// Il throw viene catturato da `publicProcedure` e trasformato in un errore tRPC
const decodeOrThrow =
  <A>(codec: { decode: (u: unknown) => E.Either<Errors, A> }) =>
  (value: unknown): A =>
    pipe(
      codec.decode(value),
      E.getOrElse<Errors, A>((errors) => {
        throw new Error(PathReporter.report(E.left(errors)).join("; "));
      }),
    );

const controlUnitsRouter = router({
  update: publicProcedure
    .input(decodeOrThrow(ControlUnitUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.controlUnits.update(input), ApiResult.fromTaskEither)),

  add: publicProcedure
    .input(decodeOrThrow(ControlUnitEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.controlUnits.add(input), ApiResult.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.controlUnits.remove(input), ApiResult.fromTaskEither)),
});

const camerasRouter = router({
  update: publicProcedure
    .input(decodeOrThrow(CameraUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.update(input), ApiResult.fromTaskEither)),

  add: publicProcedure
    .input(decodeOrThrow(CameraEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.add(input), ApiResult.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.cameras.remove(input), ApiResult.fromTaskEither)),
});

const tvsRouter = router({
  update: publicProcedure
    .input(decodeOrThrow(TvUpdateInputCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.update(input), ApiResult.fromTaskEither)),

  add: publicProcedure
    .input(decodeOrThrow(TvEntryCodec))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.add(input), ApiResult.fromTaskEither)),

  remove: publicProcedure
    .input(decodeOrThrow(T.string))
    .mutation(({ ctx, input }) => pipe(ctx.services.registry.tvs.remove(input), ApiResult.fromTaskEither)),
});

export const registryRouter = router({
  getAll: publicProcedure.query(({ ctx }) => pipe(ctx.services.registry.getAll(), ApiResult.fromTaskEither)),
  controlUnits: controlUnitsRouter,
  cameras: camerasRouter,
  tvs: tvsRouter,
});
