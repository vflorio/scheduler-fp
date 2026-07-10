import { execFile } from "node:child_process";
import { pipe } from "fp-ts/function";
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

// -------------------------------------------------------------------------------------
// Parser — avahi-browse -prt output
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

const runCommand = (command: string, args: readonly string[]): TE.TaskEither<DiscoverError, string> =>
  TE.tryCatch(
    () =>
      new Promise<string>((resolve, reject) => {
        execFile(command, args as string[], { timeout: 10_000 }, (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`${command} failed: ${err.message}${stderr ? `\n${stderr}` : ""}`));
          } else {
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
export const discover = (command: string, args: readonly string[]): TE.TaskEither<DiscoverError, Endpoint[]> =>
  pipe(runCommand(command, args), TE.map(parseAvahiBrowse));

/** Default: `avahi-browse -prt _adb-tls-connect._tcp` */
export const discoverDefault: TE.TaskEither<DiscoverError, Endpoint[]> = discover("avahi-browse", [
  "-prt",
  "_adb-tls-connect._tcp",
]);
