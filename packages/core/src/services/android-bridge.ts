import type * as TE from "fp-ts/TaskEither";
import type { AdbError, Target } from "../adb";

// -------------------------------------------------------------------------------------
// AndroidBridge service interface
// -------------------------------------------------------------------------------------

export interface AndroidBridge {
  readonly devices: () => TE.TaskEither<AdbError, readonly Target[]>;
  readonly reboot: (target: Target) => TE.TaskEither<AdbError, void>;
}
