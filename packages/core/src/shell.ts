import * as IO from "fp-ts/IO";
import { pipe } from "fp-ts/lib/function";
import type * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";
import type * as Logger from "./logger";

export interface CommandError {
  type: "CommandError";
  message: string;
}

export interface CommandTimeoutError {
  type: "CommandTimeout";
  message: string;
}

export type ShellSpawnError = CommandError | CommandTimeoutError;

export type Spawn = (command: string, args: readonly string[]) => TE.TaskEither<ShellSpawnError, string>;

// -------------------------------------------------------------------------------------

export type Env = {
  readonly logger: Logger.Tagged;
  readonly spawn: Spawn;
};

export const run =
  (command: string, args: readonly string[]): RTE.ReaderTaskEither<Env, ShellSpawnError, string> =>
  ({ logger, spawn }) =>
    pipe(
      TE.Do,
      TE.tapIO(() => logger.debug(`Shell: ${command} ${args.join(" ")}`)),
      TE.bind("spawnLogger", () => TE.fromIO(IO.of(logger.child(`Spawn`)))),
      TE.tapIO(({ spawnLogger }) => spawnLogger.debug(`Process start: ${command} ${args.join(" ")}`)),
      TE.bind("stdout", () =>
        pipe(
          spawn(command, args),
          TE.map((stdout) => stdout.trim()),
        ),
      ),
      TE.tapIO(({ spawnLogger }) => spawnLogger.debug(`Process end: ${command} ${args.join(" ")}`)),
      TE.map(({ stdout }) => stdout),
    );
