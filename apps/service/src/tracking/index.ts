import type * as Config from "@supervisor/core/config";
import type * as Logger from "@supervisor/core/logger";
import * as Predicates from "@supervisor/core/predicates/index";
import type * as Retry from "@supervisor/core/retry/retry";
import type * as Adb from "@supervisor/core/services/adb";
import * as E from "fp-ts/Either";
import * as AdbTracking from "./adb";
import * as SuitestCameraTracking from "./suitest-camera";
import * as SuitestControlUnitTracking from "./suitest-control-unit";
import * as SuitestDeviceTracking from "./suitest-device";

export * as Adb from "./adb";
export * as SuitestCamera from "./suitest-camera";
export * as SuitestControlUnit from "./suitest-control-unit";
export * as SuitestDevice from "./suitest-device";

// -------------------------------------------------------------------------------------
// Composizione dei 4 tracker di monitoring, ognuno sulla propria policy configurabile.
//
// Ogni tracker gira come loop indipendente, "fire and forget": non vanno mai concatenati
// nella catena RTE di service.ts che avvia l'ActivationRunner, perché quella catena non
// si risolve mai durante il normale funzionamento (il tick dell'activation runner ritorna
// solo dopo `stop()`) - un tracker incatenato dopo non partirebbe mai.
// -------------------------------------------------------------------------------------

export interface TrackingPolicies {
  readonly adb: Retry.Policy;
  readonly suitestCamera: Retry.Policy;
  readonly suitestControlUnit: Retry.Policy;
  readonly suitestDevice: Retry.Policy;
}

export interface TrackingEnv {
  readonly logger: Logger.Tagged;
  readonly adbEnv: Adb.AdbEnv;
  readonly suitestConfig: Config.Suitest;
  readonly policies: TrackingPolicies;
  readonly stream: Predicates.PredicateStream;
}

export interface TrackingHandle {
  readonly adbDeviceFeed: AdbTracking.DeviceFeed;
  readonly stop: () => void;
}

export const startAll = (env: TrackingEnv): TrackingHandle => {
  const adb = AdbTracking.start(env.logger.child("adb"), env.policies.adb, env.adbEnv, env.stream);

  const camera = Predicates.run(
    env.logger,
    env.policies.suitestCamera,
    SuitestCameraTracking.trackerConfig,
    env.stream,
  )({ logger: env.logger.child("camera"), suitestConfig: env.suitestConfig });

  const controlUnit = Predicates.run(
    env.logger,
    env.policies.suitestControlUnit,
    SuitestControlUnitTracking.trackerConfig,
    env.stream,
  )({ logger: env.logger.child("control-unit"), suitestConfig: env.suitestConfig });

  const device = Predicates.run(
    env.logger,
    env.policies.suitestDevice,
    SuitestDeviceTracking.trackerConfig,
    env.stream,
  )({ logger: env.logger.child("device"), suitestConfig: env.suitestConfig });

  const handles = [adb.handle, camera, controlUnit, device];

  for (const handle of handles) {
    handle.start().then((result) => {
      if (E.isLeft(result)) env.logger.error(`Tracking loop terminated unexpectedly: ${result.left.message}`)();
    });
  }

  return {
    adbDeviceFeed: adb.deviceFeed,
    stop: () => {
      for (const handle of handles) handle.stop();
    },
  };
};
