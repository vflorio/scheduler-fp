import type * as NetworkTarget from "@supervisor/core/network-target";
import type { CameraEntry, LabRegistry } from "@supervisor/core/services/db";

// -------------------------------------------------------------------------------------
// Gating: quali host ADB il discovery/connection deve considerare.
// Deriva puramente dal dominio applicativo (lab-registry)
// non appartiene al db/registry, ma al contesto che se ne serve per decidere a chi connettersi.
// -------------------------------------------------------------------------------------

// Host ADB dei device marcati come controllati (usato per il gating del recovery)
export const controlledCameraHosts = (registry: LabRegistry): readonly string[] =>
  Object.values(registry.cameras)
    .filter((d): d is CameraEntry & { adbTarget: NetworkTarget.Target } => d.controlled && d.adbTarget !== undefined)
    .map((d) => d.adbTarget.ip);

// Host ADB di tutte le camere note in registry, controllate o meno - usato per distinguere un
// device "nostro" ma non (più) controllato da uno completamente esterno al registry
export const cameraHosts = (registry: LabRegistry): readonly string[] =>
  Object.values(registry.cameras)
    .filter((d): d is CameraEntry & { adbTarget: NetworkTarget.Target } => d.adbTarget !== undefined)
    .map((d) => d.adbTarget.ip);
