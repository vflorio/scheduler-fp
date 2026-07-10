import { execFile } from "node:child_process";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export type DeviceStatus = "device" | "offline";

export interface Device {
  readonly serial: string;
  readonly status: DeviceStatus;
}

export interface AdbError {
  readonly type: "AdbError";
  readonly message: string;
}

// -------------------------------------------------------------------------------------
// Shell runner
// -------------------------------------------------------------------------------------

const run = (args: readonly string[], target?: string): TE.TaskEither<AdbError, string> =>
  TE.tryCatch(
    () =>
      new Promise<string>((resolve, reject) => {
        const fullArgs = target ? ["-s", target, ...args] : [...args];
        execFile("adb", fullArgs, { timeout: 15_000 }, (err, stdout, stderr) => {
          if (err) {
            reject(new Error(`adb ${fullArgs.join(" ")} failed: ${err.message}${stderr ? `\n${stderr}` : ""}`));
          } else {
            resolve(stdout);
          }
        });
      }),
    (reason) => ({
      type: "AdbError" as const,
      message: reason instanceof Error ? reason.message : String(reason),
    }),
  );

// -------------------------------------------------------------------------------------
// Parser — `adb devices` output
// -------------------------------------------------------------------------------------
// Output format:
//   List of devices attached
//   192.168.1.4:5555\tdevice
//   emulator-5554\toffline

const parseDevices = (stdout: string): Device[] => {
  const devices: Device[] = [];
  for (const line of stdout.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("List of")) continue;

    const parts = trimmed.split("\t");
    if (parts.length < 2) continue;

    const serial = parts[0] ?? "";
    const rawStatus = parts[1] ?? "";
    if (rawStatus === "device" || rawStatus === "offline") {
      devices.push({ serial, status: rawStatus });
    }
  }
  return devices;
};

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

// List connected devices with their status
export const devices: TE.TaskEither<AdbError, Device[]> = pipe(run(["devices"]), TE.map(parseDevices));

// Tap at screen coordinates (x, y)
export const tap = (target: string, x: number, y: number): TE.TaskEither<AdbError, void> =>
  pipe(run(["shell", "input", "tap", String(x), String(y)], target), TE.asUnit);

// Force-stop and then restart an app by package id
export const restartApp = (target: string, packageId: string): TE.TaskEither<AdbError, void> =>
  pipe(
    run(["shell", "am", "force-stop", packageId], target),
    TE.flatMap(() => run(["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"], target)),
    TE.asUnit,
  );

// Reboot the device
export const reboot = (target: string): TE.TaskEither<AdbError, void> => pipe(run(["reboot"], target), TE.asUnit);
