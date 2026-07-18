import type { AndroidBridge } from "@supervisor/core/services/android-bridge";
import { pipe } from "fp-ts/lib/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import type { AdbShellEnv } from "./adb";
import * as Adb from "./adb";

// -------------------------------------------------------------------------------------
// Shell implementation of AndroidBridge — closes over AdbShellEnv
// -------------------------------------------------------------------------------------

export const create = (env: AdbShellEnv): AndroidBridge => ({
  devices: () =>
    pipe(
      Adb.devices,
      RTE.map((devices) => devices.map((device) => device.target)),
    )(env),

  reboot: (target) => Adb.reboot(target)(env),
});
