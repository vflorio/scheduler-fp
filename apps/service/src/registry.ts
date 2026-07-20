import type * as Fs from "@supervisor/core/fs";
import type * as Logger from "@supervisor/core/logger";
import * as DeviceRegistry from "@supervisor/core/services/device-registry/device-registry";
import * as Suitest from "@supervisor/core/services/suitest";
import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";

interface RegistrySyncEnv {
  readonly logger: Logger.Tagged;
  readonly fsEnv: Fs.Env;
  readonly dbPath: string;
  readonly seedDevices?: DeviceRegistry.RegistrySeed;
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

    // Split Suitest devices per categoria (control unit, camere, tv)
    TE.map(({ suitestDevices, suitestControlUnits }) => ({
      controlUnits: suitestControlUnits,
      cameras: suitestDevices.filter((d) => d.platforms.includes("android")),
      tvs: suitestDevices.filter((d) => !d.platforms.includes("android")),
    })),

    // Merge con stato locale (preserva `controlled`)
    TE.flatMap((incoming) => DeviceRegistry.syncFromSuitest(env.dbPath)(incoming)(env.fsEnv)),

    TE.tapIO((registry) => {
      const total =
        registry.devices.controlUnits.length + registry.devices.cameras.length + registry.devices.tvs.length;

      const controlled =
        DeviceRegistry.controlledControlUnitIds(registry).length +
        DeviceRegistry.controlledCameraIps(registry).length +
        DeviceRegistry.controlledTvIps(registry).length;

      return env.logger.info(`Registry synced: ${total} devices (${controlled} controlled)`);
    }),
  );
