import { pipe } from "fp-ts/lib/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import type { Logger } from "./logger";

export interface CommandError {
  type: "CommandError";
  message: string;
}

export interface CommandTimeoutError {
  type: "CommandTimeout";
  message: string;
}

export type Error = CommandError | CommandTimeoutError;

export type Spawn = (command: string, args: readonly string[]) => TE.TaskEither<Error, string>;

// -------------------------------------------------------------------------------------

export type Env = {
  readonly logger: Logger;
  readonly spawn: Spawn;
};

export const run =
  (command: string, args: readonly string[]): RTE.ReaderTaskEither<Env, Error, string> =>
  ({ logger, spawn }) =>
    pipe(
      TE.fromIO(logger.debug(`${command} ${args.join(" ")}`)),
      TE.flatMap(() => spawn(command, args)),
      TE.map((stdout) => stdout.trim()),
      TE.tapIO((stdout) => logger.debug(`  -> ${stdout}`)),
    );
