import { execFile as AvahiBrowse } from "node:child_process";
import type { Logger } from "@supervisor/core/logger";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Endpoint {
  readonly ip: string;
  readonly port: number;
}

export interface DiscoverError {
  readonly type: "DiscoverError";
  readonly message: string;
}

export interface MdnsShellEnv {
  readonly logger: Logger;
}

type Effect<A> = RTE.ReaderTaskEither<MdnsShellEnv, DiscoverError, A>;

// -------------------------------------------------------------------------------------
// Parser - avahi-browse -prt output
// -------------------------------------------------------------------------------------
// Resolved lines (=) have the format:
//   =;iface;protocol;name;type;domain;hostname;address;port;txt
//
// We extract address (field 7) and port (field 8).

const parseAvahiBrowse = (stdout: string): Endpoint[] => {
  const seen = new Set<string>();
  const endpoints: Endpoint[] = [];

  for (const line of stdout.split("\n")) {
    if (!line.startsWith("=")) continue;
    const fields = line.split(";");
    if (fields.length < 9) continue;

    const ip = fields[7];
    const port = Number(fields[8]);
    if (!ip || Number.isNaN(port)) continue;

    const key = `${ip}:${port}`;
    if (seen.has(key)) continue;
    seen.add(key);
    endpoints.push({ ip, port });
  }

  return endpoints;
};

// -------------------------------------------------------------------------------------
// Shell runner
// -------------------------------------------------------------------------------------

const run =
  (command: string, args: readonly string[]): Effect<string> =>
  ({ logger }) =>
    TE.tryCatch(
      () =>
        new Promise<string>((resolve, reject) => {
          logger.debug(`${command} ${args.join(" ")}`)();
          AvahiBrowse(command, args as string[], { timeout: 10_000 }, (err, stdout, stderr) => {
            if (err) {
              reject(new Error(`${command} failed: ${err.message}${stderr ? `\n${stderr}` : ""}`));
            } else {
              if (stdout.trim()) logger.debug(`  -> ${stdout.trim().split("\n")[0]}`)();
              resolve(stdout);
            }
          });
        }),
      (reason) => ({
        type: "DiscoverError" as const,
        message: reason instanceof Error ? reason.message : String(reason),
      }),
    );

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

/**
 * Discover endpoints by running an external command and parsing its output.
 *
 * @param command - The executable (e.g. "avahi-browse" on Linux, "dns-sd" wrapper on macOS)
 * @param args - Arguments to pass (e.g. ["-prt", "_adb-tls-connect._tcp"])
 */
export const discover = (command: string, args: readonly string[]): Effect<Endpoint[]> =>
  pipe(run(command, args), RTE.map(parseAvahiBrowse));

// Default: avahi-browse -prt _adb-tls-connect._tcp
export const discoverDefaultAdbTslConnect: Effect<Endpoint[]> = discover("avahi-browse", [
  "-prt",
  "_adb-tls-connect._tcp",
]);

// Default: avahi-browse -prt _adb-tls-pairing._tcp
export const discoverDefaultAdbTslPairing: Effect<Endpoint[]> = discover("avahi-browse", [
  "-prt",
  "_adb-tls-pairing._tcp",
]);
