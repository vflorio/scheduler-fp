import type { CameraEntry, LabRegistry } from "@supervisor/core/services/db";
import * as Socket from "@supervisor/core/socket";

// -------------------------------------------------------------------------------------
// Gating: quali host ADB il discovery/connection deve considerare.
// Deriva puramente dal dominio applicativo (lab-registry)
// non appartiene al db/registry, ma al contesto che se ne serve per decidere a chi connettersi.
// -------------------------------------------------------------------------------------

// Host ADB dei device marcati come controllati (usato per il gating del recovery)
export const controlledCameraHosts = (registry: LabRegistry): readonly string[] =>
  Object.values(registry.cameras)
    .filter((d): d is CameraEntry & { adbTarget: Socket.IPv4 } => d.controlled && d.adbTarget !== undefined)
    .map((d) => Socket.from(d.adbTarget).host);

// Host ADB di tutte le camere note in registry, controllate o meno - usato per distinguere un
// device "nostro" ma non (più) controllato da uno completamente esterno al registry
export const cameraHosts = (registry: LabRegistry): readonly string[] =>
  Object.values(registry.cameras)
    .filter((d): d is CameraEntry & { adbTarget: Socket.IPv4 } => d.adbTarget !== undefined)
    .map((d) => Socket.from(d.adbTarget).host);
