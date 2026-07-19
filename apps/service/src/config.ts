import { readFileSync } from "node:fs";
import * as Config from "@supervisor/core/config";
import * as HTTP from "@supervisor/core/http";
import * as E from "fp-ts/Either";
import { flow, pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import { parse as parseJsonc } from "jsonc-parser";
import type * as Args from "./args";

// -------------------------------------------------------------------------------------
// Config fetcher
// -------------------------------------------------------------------------------------

export interface FetchError {
  readonly type: "FetchError";
  readonly message: string;
}

export type ConfigFetcher = () => TE.TaskEither<FetchError, unknown>;

const fromFile =
  (path: string): ConfigFetcher =>
  () =>
    TE.tryCatch(
      () => Promise.resolve(parseJsonc(readFileSync(path, "utf-8"))),
      (fsError) => ({ type: "FetchError" as const, message: `Cannot read config file: ${fsError}` }),
    );

const fromUrl =
  (url: string): ConfigFetcher =>
  () =>
    pipe(
      HTTP.getJson(url),
      TE.mapLeft((httpError) => ({
        type: "FetchError" as const,
        message: `Cannot fetch config from URL: ${httpError.message}`,
      })),
    );

export const toFetcher = (source: Args.ConfigSource): ConfigFetcher =>
  source.type === "file" ? fromFile(source.path) : fromUrl(source.url);

// -------------------------------------------------------------------------------------
// Config loading
// -------------------------------------------------------------------------------------

export interface LoadError {
  readonly type: "LoadError";
  readonly message: string;
}

export const load = (fetcher: ConfigFetcher): TE.TaskEither<LoadError | FetchError, Config.ServiceConfig> =>
  pipe(
    fetcher(),
    TE.flatMapEither(
      flow(
        Config.decode,
        E.mapLeft((e) => ({ type: "LoadError" as const, message: `Load error: ${e.message}` })),
      ),
    ),
  );
