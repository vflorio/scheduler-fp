import type * as Fs from "@supervisor/core/fs";
import type * as Logger from "@supervisor/core/logger";
import * as Db from "@supervisor/core/services/db";
import * as Suitest from "@supervisor/core/services/suitest";
import { pipe } from "fp-ts/function";
import * as IO from "fp-ts/IO";
import * as TE from "fp-ts/TaskEither";

interface RegistrySyncEnv {
  readonly logger: Logger.Tagged;
  readonly fsEnv: Fs.Env;
  readonly dbPath: string;
  readonly seedDevices?: Db.LabRegistrySeed;
  readonly suitestConfig: Suitest.SuitestConfig;
}

export type SyncError = Db.DbError;

const errorMessage = (err: { message: string }): string => err.message;

// Fetch dei tre endpoint Suitest, in parallelo
// /devices ritorna TV e smart plug
// /video-capture-devices ritorna le camera
const fetchSuitestLists = (
  logger: Logger.Tagged,
  suitestConfig: Suitest.SuitestConfig,
): TE.TaskEither<Suitest.SuitestError, Db.SuitestLists> => {
  const config: Suitest.SuitestConfig = { ...suitestConfig, logger: logger.child("Suitest") };

  return pipe(
    TE.Do,
    TE.bind("devices", () => Suitest.getAllDevices(config)),
    TE.bind("controlUnits", () => Suitest.getControlUnits(config)),
    TE.bind("videoCaptureDevices", () => Suitest.getVideoCaptureDevices(config)),
    TE.tapIO(({ devices, controlUnits, videoCaptureDevices }) =>
      logger.info(
        `Fetched ${devices.length} devices, ${controlUnits.length} control units, ` +
          `${videoCaptureDevices.length} video capture devices from Suitest`,
      ),
    ),
  );
};

// Registry sync:
//  init db
//    |> fetch suitest
//    |> replace mirror + auto-import control unit
//    |> write
// Se Suitest non è raggiungibile la sync viene saltata (warning, non un errore fatale): il
// servizio continua a operare con il db esistente, dato che il dominio applicativo (lab) è
// preconfigurabile e operabile offline indipendentemente da Suitest.
export const sync = (env: RegistrySyncEnv): TE.TaskEither<SyncError, Db.Db> =>
  pipe(
    // Init db (crea file JSON se non esiste)
    Db.init(env.dbPath, env.seedDevices)(env.fsEnv),
    TE.tapIO(() => env.logger.info("Device Registry DB initialized")),

    TE.flatMap((currentDb) =>
      pipe(
        fetchSuitestLists(env.logger, env.suitestConfig),
        TE.flatMap((incoming) => Db.syncFromSuitest(env.dbPath)(incoming)(env.fsEnv)),
        TE.orElse((err) =>
          pipe(
            TE.fromIO(env.logger.warn(`Suitest sync skipped, continuing without it: ${errorMessage(err)}`)),
            TE.map(() => currentDb),
          ),
        ),
      ),
    ),

    TE.tapIO((db) => {
      const mirrored =
        Object.keys(db.suitest.devices).length +
        Object.keys(db.suitest.controlUnits).length +
        Object.keys(db.suitest.videoCaptureDevices).length;

      const controlled =
        Db.controlledControlUnitIds(db.lab).length +
        Object.values(db.lab.cameras).filter((d) => d.controlled).length +
        Object.values(db.lab.tvs).filter((d) => d.controlled).length;

      return env.logger.info(
        `Registry ready: ${mirrored} suitest entities mirrored (${controlled} lab devices controlled)`,
      );
    }),
  );
