import * as E from "fp-ts/Either";
import type { Endomorphism } from "fp-ts/Endomorphism";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import type * as Fs from "../../fs";
import { type ValidationError, validate } from "../../validation";
import { type CameraEntry, CameraEntryCodec } from "./camera";
import { type ControlUnitEntry, ControlUnitEntryCodec } from "./control-unit";
import { type TvEntry, TvEntryCodec } from "./tv";

export * from "./camera";
export * from "./control-unit";
export * from "./suitest";
export * from "./tv";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

const RegistryCodec = t.type({
  devices: t.type({
    controlUnits: t.array(ControlUnitEntryCodec),
    cameras: t.array(CameraEntryCodec),
    tvs: t.array(TvEntryCodec),
  }),
});

export type Registry = t.TypeOf<typeof RegistryCodec>;

export interface RegistrySeed {
  readonly controlUnits?: readonly ControlUnitEntry[];
  readonly cameras?: readonly CameraEntry[];
  readonly tvs?: readonly TvEntry[];
}

export const empty: Registry = { devices: { controlUnits: [], cameras: [], tvs: [] } };

export type RegistryError = Fs.FileSystemError | ValidationError | ParseError;

export interface ParseError {
  readonly type: "ParseError";
  readonly message: string;
}

// -------------------------------------------------------------------------------------
// Persistence: read(mutate(write))
// -------------------------------------------------------------------------------------

const parseJson = (raw: string): E.Either<ParseError, unknown> =>
  E.tryCatch(
    () => JSON.parse(raw),
    (e) => ({ type: "ParseError" as const, message: e instanceof Error ? e.message : String(e) }),
  );

export const read =
  (path: string): ((env: Fs.Env) => TE.TaskEither<RegistryError, Registry>) =>
  (env) =>
    pipe(env.readFile(path), TE.flatMapEither(parseJson), TE.flatMapEither(validate(RegistryCodec)));

export const write =
  (path: string) =>
  (registry: Registry): ((env: Fs.Env) => TE.TaskEither<RegistryError, void>) =>
  (env) =>
    env.writeFile(path, JSON.stringify(registry, null, 2));

export const modify =
  (path: string) =>
  (f: Endomorphism<Registry>): ((env: Fs.Env) => TE.TaskEither<RegistryError, Registry>) =>
  (env) =>
    pipe(
      read(path)(env),
      TE.map(f),
      TE.tap((updated) => write(path)(updated)(env)),
    );

// -------------------------------------------------------------------------------------
// Init: se non esiste crea il file e seeding, altrimenti legge
// -------------------------------------------------------------------------------------

export const init =
  (path: string, seed?: RegistrySeed): ((env: Fs.Env) => TE.TaskEither<RegistryError, Registry>) =>
  (env) =>
    pipe(
      read(path)(env),
      TE.orElse(() => {
        const initial: Registry = {
          devices: {
            controlUnits: [...(seed?.controlUnits ?? [])].map((d) => ({ ...d, controlled: true })),
            cameras: [...(seed?.cameras ?? [])].map((d) => ({ ...d, controlled: true })),
            tvs: [...(seed?.tvs ?? [])].map((d) => ({ ...d, controlled: true })),
          },
        };

        return pipe(
          write(path)(initial)(env),
          TE.map(() => initial),
        );
      }),
    );
