import type * as Fs from "@supervisor/core/fs";
import type * as Logger from "@supervisor/core/logger";
import * as DeviceRegistry from "@supervisor/core/services/device-registry";
import * as Suitest from "@supervisor/core/services/suitest";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";

interface RegistrySyncEnv {
  readonly logger: Logger.Tagged;
  readonly fsEnv: Fs.Env;
  readonly dbPath: string;
  readonly seedDevices?: readonly DeviceRegistry.DeviceEntry[];
  readonly suitestConfig: Suitest.SuitestConfig;
}

export type SyncError = DeviceRegistry.RegistryError | Suitest.SuitestError;

// Registry sync: init db -> fetch suitest -> merge -> write
export const sync = (env: RegistrySyncEnv): TE.TaskEither<SyncError, DeviceRegistry.Registry> =>
  pipe(
    // Init db (crea file JSON se non esiste)
    DeviceRegistry.init(env.dbPath, env.seedDevices)(env.fsEnv),
    TE.tapIO(() => env.logger.info("Device Registry DB initialized")),

    // Sync da Suitest
    TE.flatMap(() => {
      const suitestConfigWithLogger: Suitest.SuitestConfig = {
        ...env.suitestConfig,
        logger: env.logger.child("Suitest"),
      };

      return pipe(
        TE.Do,
        TE.bind("suitestDevices", () => Suitest.getAllDevices(suitestConfigWithLogger)),
        TE.bind("suitestControlUnits", () => Suitest.getControlUnits(suitestConfigWithLogger)),
        TE.tapIO(({ suitestDevices, suitestControlUnits }) =>
          env.logger.info(
            `Fetched ${suitestDevices.length} devices, ${suitestControlUnits.length} control units from Suitest`,
          ),
        ),
        TE.tapError((err) =>
          TE.fromIO(env.logger.error(`Suitest fetch failed: ${"message" in err ? err.message : String(err)}`)),
        ),
      );
    }),

    // Map Suitest devices -> registry entries per category
    TE.map(({ suitestDevices }) => {
      const cameras = suitestDevices.filter((d) => d.platforms.includes("android"));
      const tvs = suitestDevices.filter((d) => !d.platforms.includes("android"));

      return [
        ...DeviceRegistry.fromSuitestDevices(cameras, "android-camera"),
        ...DeviceRegistry.fromSuitestDevices(tvs, "smart-tv"),
      ];
    }),

    // Merge con stato locale
    TE.flatMap((incoming) => DeviceRegistry.modify(env.dbPath)(DeviceRegistry.mergeWithSuitest(incoming))(env.fsEnv)),

    TE.tapIO((registry) =>
      env.logger.info(
        `Registry synced: ${registry.devices.length} devices (${registry.devices.filter((d) => d.controlled).length} controlled)`,
      ),
    ),
  );
