import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type * as Fs from "@supervisor/core/fs";
import * as Logger from "@supervisor/core/logger";
import type * as Shell from "@supervisor/core/shell";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as ServiceLogger from "./logger";

export interface Process {
  readonly onSignal: (signal: NodeJS.Signals, handler: () => void) => void;
  readonly exit: (code: number) => never;
}

export const spawn: Shell.Spawn = (command, args) =>
  pipe(
    TE.tryCatch(
      () =>
        new Promise<string>((resolve, reject) => {
          execFile(command, args, (error, stdout, stderr) =>
            error ? reject({ ...error, message: `${error.message} - ${stderr}` }) : resolve(stdout),
          );
        }),
      (error) => ({ type: "CommandError" as const, message: error instanceof Error ? error.message : String(error) }),
    ),
  );

export const fsEnv: Fs.Env = {
  logger: pipe(ServiceLogger.create({ level: "debug" }), Logger.tagged("FS")),

  readFile: (path) =>
    TE.tryCatch(
      () => readFile(path, "utf-8"),
      (e) => ({ type: "FileSystemError" as const, message: e instanceof Error ? e.message : String(e) }),
    ),
  writeFile: (path, content) =>
    TE.tryCatch(
      async () => {
        await mkdir(dirname(path), { recursive: true });
        await writeFile(path, content, "utf-8");
      },
      (e) => ({ type: "FileSystemError" as const, message: e instanceof Error ? e.message : String(e) }),
    ),
};
