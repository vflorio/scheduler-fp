import { execFile } from "node:child_process";
import * as Adb from "@supervisor/core/adb";
import * as A from "fp-ts/Array";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as TE from "fp-ts/TaskEither";
import { match, P } from "ts-pattern";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Device {
  readonly target: Adb.Target;
  readonly status: Adb.DeviceState;
}

// -------------------------------------------------------------------------------------
// Shell runner
// -------------------------------------------------------------------------------------

const run = (args: readonly string[], target?: string): TE.TaskEither<Adb.AdbError, string> =>
  TE.tryCatch(
    () =>
      new Promise<string>((resolve, reject) => {
        const fullArgs = target ? ["-s", target, ...args] : [...args];
        console.log(`Running: adb ${fullArgs.join(" ")}`);
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
//   192.168.1.4:5555\tdevice -> catturato
//   emulator-5554\toffline   -> filtrato

const parseLine = (line: string): O.Option<Device> => {
  const parts = line.trim().split("\t");
  if (parts.length < 2) return O.none;

  return pipe(
    O.Do,
    O.bind("target", () =>
      pipe(
        Adb.Target.decode(parts[0]),
        E.fold(() => O.none, O.some),
      ),
    ),
    O.bind("status", () => Adb.matchDeviceState(parts[1] ?? "")),
  );
};

const parseDevices = (stdout: string): Device[] =>
  pipe(
    stdout.split("\n"),
    A.filter((line) => line.trim() !== "" && !line.startsWith("List of")),
    A.filterMap(parseLine),
  );

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

export const getState = (target: Adb.Target): TE.TaskEither<Adb.AdbError, Adb.DeviceState> =>
  pipe(
    run(["get-state"], target),
    TE.map((stdout) => stdout.trim()),
    TE.map((state) =>
      match(state)
        .with(
          P.union("device", "recovery", "rescue", "sideload", "bootloader", "disconnect", "offline"),
          (s) => s as Adb.DeviceState,
        )
        .otherwise(() => "unknown" as Adb.DeviceState),
    ),
  );

// Pair
export const pair = (target: Adb.Target, pairingCode: string): TE.TaskEither<Adb.AdbError, void> =>
  pipe(run(["pair", target, pairingCode]), TE.asUnit);

// Connect
export const connect = (target: Adb.Target): TE.TaskEither<Adb.AdbError, void> =>
  pipe(run(["connect", target]), TE.asUnit);

// Disconnect
export const disconnect = (target: Adb.Target): TE.TaskEither<Adb.AdbError, void> =>
  pipe(run(["disconnect", target]), TE.asUnit);

// TCP-IP protocol set
export const tcpip = (target: Adb.Target, port: number): TE.TaskEither<Adb.AdbError, void> =>
  pipe(run(["tcpip", String(port)], target), TE.asUnit);

// List connected devices with their status
export const devices: TE.TaskEither<Adb.AdbError, Device[]> = pipe(
  run(["devices"]),
  TE.map(parseDevices),
  TE.tap((devices) =>
    TE.fromIO(() => {
      console.log(`Discovered ${devices.length} devices: ${JSON.stringify(devices)}`);
    }),
  ),
);

// isConnected
export const isConnected1 = (target: Adb.Target): TE.TaskEither<Adb.AdbError, boolean> =>
  pipe(
    getState(target),
    TE.map((state) => state === "device"),
  );

// isConnected
export const isConnected = (target: Adb.Target): TE.TaskEither<Adb.AdbError, boolean> =>
  pipe(
    devices,
    TE.map((devices) =>
      devices.some(
        (device) => Adb.withPort(device.target, 0) === Adb.withPort(target, 0) && device.status === "device",
      ),
    ),
  );

// Tap at screen coordinates (x, y)
export const tap = (target: Adb.Target, x: number, y: number): TE.TaskEither<Adb.AdbError, void> =>
  pipe(run(["shell", "input", "tap", String(x), String(y)], target), TE.asUnit);

// Force-stop and then restart an app by package id
export const restartApp = (target: Adb.Target, packageId: string): TE.TaskEither<Adb.AdbError, void> =>
  pipe(
    run(["shell", "am", "force-stop", packageId], target),
    TE.flatMap(() => run(["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"], target)),
    TE.asUnit,
  );

// Reboot the device
export const reboot = (target: Adb.Target): TE.TaskEither<Adb.AdbError, void> =>
  pipe(run(["reboot"], target), TE.asUnit);

export const waitForState =
  (state: Adb.DeviceState) =>
  (target: Adb.Target): TE.TaskEither<Adb.AdbError, void> =>
    pipe(run(["wait-for", state], target), TE.asUnit);

export const waitForDevice = waitForState("device");
export const waitForDisconnect = waitForState("disconnect");
