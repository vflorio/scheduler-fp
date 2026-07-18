import type * as Logger from "@supervisor/core/logger";
import * as Socket from "@supervisor/core/socket";
import * as A from "fp-ts/Array";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import { match, P } from "ts-pattern";
import type { AndroidBridge } from "./services";
import type * as Shell from "./shell";

// FIXME WIP service interfaces
export const create = (env: { spawn: Shell.Spawn; logger: Logger.Tagged }): AndroidBridge => ({
  devices: () => devices(env),
  reboot: (target) => reboot(target)(env),
});

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface AdbEnv {
  readonly logger: Logger.Tagged;
  readonly spawn: Shell.Spawn;
}

export type AdbError = Shell.Error | { type: "AdbError"; message: string };

type Effect<A> = RTE.ReaderTaskEither<AdbEnv, AdbError, A>;

export interface Device {
  readonly target: Socket.IPv4;
  readonly status: Status;
}

export type Status =
  | "device"
  | "recovery"
  | "rescue"
  | "sideload"
  | "bootloader"
  | "disconnect"
  | "offline"
  | "unknown";

export const matchDeviceState = (raw: string): O.Option<Status> =>
  match(raw)
    .with(
      P.union("device", "recovery", "rescue", "sideload", "bootloader", "disconnect", "offline"),
      (s): O.Option<Status> => O.some(s),
    )
    .otherwise(() => O.none);

// -------------------------------------------------------------------------------------
// Shell runner
// -------------------------------------------------------------------------------------

const run =
  (args: readonly string[], target?: Socket.IPv4): Effect<string> =>
  ({ logger, spawn: shell }) =>
    pipe(
      TE.of(target ? ["-s", target, ...args] : [...args]),
      TE.tapIO((fullArgs) => logger.debug(`adb ${fullArgs.join(" ")}`)),
      TE.flatMap(() => shell("adb", target ? ["-s", target, ...args] : [...args])),
      TE.map((stdout) => stdout.trim()),
      TE.tapIO((stdout) => logger.debug(`  -> ${stdout}`)),
    );

// -------------------------------------------------------------------------------------
// Parser - `adb devices` output
// -------------------------------------------------------------------------------------
// Output format:
//   List of devices attached
//   192.168.1.4:5555\tdevice -> catturato
//   emulator-5554\toffline   -> escluso

const parseLine = (line: string): O.Option<Device> => {
  const parts = line.trim().split("\t");
  if (parts.length < 2) return O.none;

  return pipe(
    O.Do,
    O.bind("target", () =>
      pipe(
        Socket.Codec.decode(parts[0]),
        E.fold(() => O.none, O.some),
      ),
    ),
    O.bind("status", () => matchDeviceState(parts[1] ?? "")),
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

export const getState = (target: Socket.IPv4): Effect<Status> =>
  pipe(
    run(["get-state"], target),
    RTE.map((stdout) => stdout.trim()),
    RTE.map((state) =>
      match(state)
        .with(
          P.union("device", "recovery", "rescue", "sideload", "bootloader", "disconnect", "offline"),
          (s) => s as Status,
        )
        .otherwise(() => "unknown" as Status),
    ),
  );

// Pair
export const pair =
  (pairingCode: string) =>
  (target: Socket.IPv4): Effect<void> =>
    pipe(run(["pair", target, pairingCode]), RTE.asUnit);

// Connect
export const connect = (target: Socket.IPv4): Effect<void> => pipe(run(["connect", target]), RTE.asUnit);

// Disconnect
export const disconnect = (target: Socket.IPv4): Effect<void> => pipe(run(["disconnect", target]), RTE.asUnit);

// TCP-IP protocol set
export const tcpip =
  (port: number) =>
  (target: Socket.IPv4): Effect<void> =>
    pipe(run(["tcpip", String(port)], target), RTE.asUnit);

// List connected devices with their status
export const devices: Effect<Device[]> = pipe(run(["devices"]), RTE.map(parseDevices));

// isConnected
export const isConnected = (target: Socket.IPv4): Effect<boolean> =>
  pipe(
    devices,
    RTE.map(RA.some((device) => device.status === "device" && Socket.EqByHost.equals(device.target, target))),
  );

// Wake the screen up (KEYCODE_WAKEUP = 224, does not toggle off if already on)
export const wakeUp = (target: Socket.IPv4): Effect<void> =>
  pipe(run(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], target), RTE.asUnit);

// Dismiss keyguard (swipe up gesture for non-secure lockscreen)
export const dismissKeyguard = (target: Socket.IPv4): Effect<void> =>
  pipe(run(["shell", "input", "swipe", "540", "1800", "540", "400", "300"], target), RTE.asUnit);

// Tap at screen coordinates (x, y)
export const inputTap =
  (x: number, y: number) =>
  (target: Socket.IPv4): Effect<void> =>
    pipe(run(["shell", "input", "tap", String(x), String(y)], target), RTE.asUnit);

// Launch an app by package id (does not force-stop first)
export const launchApp =
  (packageId: string) =>
  (target: Socket.IPv4): Effect<void> =>
    pipe(run(["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"], target), RTE.asUnit);

// Open a URL in the default browser via ACTION_VIEW intent
export const openUrl =
  (url: string) =>
  (target: Socket.IPv4): Effect<void> =>
    pipe(run(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url], target), RTE.asUnit);

// Force-stop and then restart an app by package id
export const restartApp =
  (packageId: string) =>
  (target: Socket.IPv4): Effect<void> =>
    pipe(
      run(["shell", "am", "force-stop", packageId], target),
      RTE.flatMap(() =>
        run(["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"], target),
      ),
      RTE.asUnit,
    );

// Reboot the device
export const reboot = (target: Socket.IPv4): Effect<void> => pipe(run(["reboot"], target), RTE.asUnit);

export const waitForState =
  (state: Status) =>
  (target: Socket.IPv4): Effect<void> =>
    pipe(run([`wait-for-${state}`], target), RTE.asUnit);

export const waitForDevice = waitForState("device");
export const waitForDisconnect = waitForState("disconnect");

// Get the currently focused (foreground) app activity
// Uses `dumpsys window` and reads `mFocusedApp` which reports the actual foreground activity
// even when system UI (NotificationShade, etc.) has window focus.
// Format: "mFocusedApp=ActivityRecord{hash u0 com.pkg/com.pkg.Activity} ..."
export const getResumedActivity = (target: Socket.IPv4): Effect<O.Option<string>> =>
  pipe(
    run(["shell", "dumpsys", "window"], target),
    RTE.map((stdout) => {
      // Join all lines to handle line wrapping in dumpsys output
      const flat = stdout.replace(/\n\s*/g, " ");
      const m = flat.match(/mFocusedApp=ActivityRecord\{[^}]*\s([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.]+)/);
      return m ? O.some(m[1]!) : O.none;
    }),
  );

// Check if a specific activity (full component or substring) is currently in foreground
export const isActivityResumed =
  (activity: string) =>
  (target: Socket.IPv4): Effect<boolean> =>
    pipe(getResumedActivity(target), RTE.map(O.exists((resumed) => resumed.includes(activity))));
