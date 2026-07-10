import { readFileSync } from "node:fs";
import * as Config from "@supervisor/core/config";
import * as HTTP from "@supervisor/core/http";
import * as E from "fp-ts/Either";
import { flow, pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import type * as Args from "./args";

// -------------------------------------------------------------------------------------
// Config fetcher
// -------------------------------------------------------------------------------------

export type ConfigFetcher = () => TE.TaskEither<string, unknown>;

const fromFile =
  (path: string): ConfigFetcher =>
  () =>
    TE.tryCatch(
      () => Promise.resolve(JSON.parse(readFileSync(path, "utf-8"))),
      (err) => `Cannot read config file: ${err}`,
    );

const fromUrl =
  (url: string): ConfigFetcher =>
  () =>
    pipe(
      HTTP.getJson(url),
      TE.mapLeft((e) => `Cannot fetch config from URL: ${e.error}`),
    );

export const toFetcher = (source: Args.ConfigSource): ConfigFetcher =>
  source.type === "file" ? fromFile(source.path) : fromUrl(source.url);

// -------------------------------------------------------------------------------------
// Config loading
// -------------------------------------------------------------------------------------

export const load = (fetcher: ConfigFetcher): TE.TaskEither<string, Config.ServiceConfig> =>
  pipe(
    fetcher(),
    TE.flatMapEither(
      flow(
        Config.decode,
        E.mapLeft((e) => e.message),
      ),
    ),
  );
