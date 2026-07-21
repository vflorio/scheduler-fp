import type { CameraEntry, LabRegistry } from "@supervisor/core/services/db";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import * as RA from "fp-ts/ReadonlyArray";

// -------------------------------------------------------------------------------------
// Gating: quali host ADB il discovery/connection deve considerare.
// Deriva puramente dal dominio applicativo (lab-registry)
// non appartiene al db/registry, ma al contesto che se ne serve per decidere a chi connettersi.
// -------------------------------------------------------------------------------------

// Risolve la foreign key `adbId` nel registro `lab.adb` per ottenere l'host effettivo
const resolveAdbHost =
  (registry: LabRegistry) =>
  (camera: CameraEntry): O.Option<string> =>
    pipe(
      camera.adbId,
      O.chain((id) => O.fromNullable(registry.adb[id])),
      O.map((entry) => entry.target.ip),
    );

// Host ADB dei device marcati come controllati (usato per il gating del recovery)
export const controlledCameraHosts = (registry: LabRegistry): readonly string[] =>
  pipe(
    Object.values(registry.cameras),
    RA.filter((d) => d.controlled),
    RA.filterMap(resolveAdbHost(registry)),
  );

// Host ADB di tutte le camere note in registry, controllate o meno - usato per distinguere un
// device "nostro" ma non (più) controllato da uno completamente esterno al registry
export const cameraHosts = (registry: LabRegistry): readonly string[] =>
  pipe(Object.values(registry.cameras), RA.filterMap(resolveAdbHost(registry)));
