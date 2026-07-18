import { execFile } from "node:child_process";
import * as Adb from "@supervisor/core/adb";
import type { Logger } from "@supervisor/core/logger";
import * as A from "fp-ts/Array";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import { match, P } from "ts-pattern";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Device {
  readonly target: Adb.Target;
  readonly status: Adb.DeviceState;
}

export interface AdbShellEnv {
  readonly logger: Logger;
}

type Effect<A> = RTE.ReaderTaskEither<AdbShellEnv, Adb.AdbError, A>;

// -------------------------------------------------------------------------------------
// Shell runner
// -------------------------------------------------------------------------------------

const run =
  (args: readonly string[], target?: string): Effect<string> =>
  ({ logger }) =>
    TE.tryCatch(
      () =>
        new Promise<string>((resolve, reject) => {
          const fullArgs = target ? ["-s", target, ...args] : [...args];

          logger.debug(`adb ${fullArgs.join(" ")}`)();
          execFile("adb", fullArgs, { timeout: 15_000 }, (err, stdout, stderr) => {
            if (err) {
              reject(new Error(`adb ${fullArgs.join(" ")} failed: ${err.message}${stderr ? `\n${stderr}` : ""}`));
            } else {
              if (stdout.trim()) logger.debug(`  -> ${stdout.trim().split("\n")[0]}`)();
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
// Parser - `adb devices` output
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

export const getState = (target: Adb.Target): Effect<Adb.DeviceState> =>
  pipe(
    run(["get-state"], target),
    RTE.map((stdout) => stdout.trim()),
    RTE.map((state) =>
      match(state)
        .with(
          P.union("device", "recovery", "rescue", "sideload", "bootloader", "disconnect", "offline"),
          (s) => s as Adb.DeviceState,
        )
        .otherwise(() => "unknown" as Adb.DeviceState),
    ),
  );

// Pair
export const pair =
  (pairingCode: string) =>
  (target: Adb.Target): Effect<void> =>
    pipe(run(["pair", target, pairingCode]), RTE.asUnit);

// Connect
export const connect = (target: Adb.Target): Effect<void> => pipe(run(["connect", target]), RTE.asUnit);

// Disconnect
export const disconnect = (target: Adb.Target): Effect<void> => pipe(run(["disconnect", target]), RTE.asUnit);

// TCP-IP protocol set
export const tcpip =
  (port: number) =>
  (target: Adb.Target): Effect<void> =>
    pipe(run(["tcpip", String(port)], target), RTE.asUnit);

// List connected devices with their status
export const devices: Effect<Device[]> = pipe(run(["devices"]), RTE.map(parseDevices));

// isConnected
export const isConnected = (target: Adb.Target): Effect<boolean> =>
  pipe(devices, RTE.map(RA.some((device) => device.status === "device" && Adb.EqByHost.equals(device.target, target))));

// Wake the screen up (KEYCODE_WAKEUP = 224, does not toggle off if already on)
export const wakeUp = (target: Adb.Target): Effect<void> =>
  pipe(run(["shell", "input", "keyevent", "KEYCODE_WAKEUP"], target), RTE.asUnit);

// Dismiss keyguard (swipe up gesture for non-secure lockscreen)
export const dismissKeyguard = (target: Adb.Target): Effect<void> =>
  pipe(run(["shell", "input", "swipe", "540", "1800", "540", "400", "300"], target), RTE.asUnit);

// Tap at screen coordinates (x, y)
export const inputTap =
  (x: number, y: number) =>
  (target: Adb.Target): Effect<void> =>
    pipe(run(["shell", "input", "tap", String(x), String(y)], target), RTE.asUnit);

// Launch an app by package id (does not force-stop first)
export const launchApp =
  (packageId: string) =>
  (target: Adb.Target): Effect<void> =>
    pipe(run(["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"], target), RTE.asUnit);

// Open a URL in the default browser via ACTION_VIEW intent
export const openUrl =
  (url: string) =>
  (target: Adb.Target): Effect<void> =>
    pipe(run(["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", url], target), RTE.asUnit);

// Force-stop and then restart an app by package id
export const restartApp =
  (packageId: string) =>
  (target: Adb.Target): Effect<void> =>
    pipe(
      run(["shell", "am", "force-stop", packageId], target),
      RTE.flatMap(() =>
        run(["shell", "monkey", "-p", packageId, "-c", "android.intent.category.LAUNCHER", "1"], target),
      ),
      RTE.asUnit,
    );

// Reboot the device
export const reboot = (target: Adb.Target): Effect<void> => pipe(run(["reboot"], target), RTE.asUnit);

export const waitForState =
  (state: Adb.DeviceState) =>
  (target: Adb.Target): Effect<void> =>
    pipe(run([`wait-for-${state}`], target), RTE.asUnit);

export const waitForDevice = waitForState("device");
export const waitForDisconnect = waitForState("disconnect");

// Get the currently focused (foreground) app activity
// Uses `dumpsys window` and reads `mFocusedApp` which reports the actual foreground activity
// even when system UI (NotificationShade, etc.) has window focus.
// Format: "mFocusedApp=ActivityRecord{hash u0 com.pkg/com.pkg.Activity} ..."
export const getResumedActivity = (target: Adb.Target): Effect<O.Option<string>> =>
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
  (target: Adb.Target): Effect<boolean> =>
    pipe(getResumedActivity(target), RTE.map(O.exists((resumed) => resumed.includes(activity))));
