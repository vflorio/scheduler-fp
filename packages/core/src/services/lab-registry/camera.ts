import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import * as Socket from "../../socket";
import type { LabRegistry } from "./registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

// Identità stabile locale (`id`): una camera Suitest non ha un IP (solo customName), e l'host
// ADB associato può cambiare/essere riassegnato, quindi non possono fungere da chiave primaria.
export const CameraEntryCodec = t.intersection([
  t.type({
    id: t.string,
    label: t.string,
    controlled: t.boolean,
  }),
  t.partial({
    adbTarget: Socket.Codec, // "host:port" ADB assegnato manualmente (es. un tablet)
    // Foreign key verso suitest-store.videoCaptureDevices[suitestId], impostata manualmente in
    // fase di riconciliazione via UI (una camera aggiunta a mano, es. un tablet, può non averla)
    suitestId: t.string,
  }),
]);

export type CameraEntry = t.TypeOf<typeof CameraEntryCodec>;

export const CameraUpdateInputCodec = t.intersection([
  t.type({ id: t.string }),
  t.partial({ label: t.string, controlled: t.boolean, adbTarget: Socket.Codec, suitestId: t.string }),
]);

export type CameraUpdateInput = t.TypeOf<typeof CameraUpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Combinators - Cameras
// -------------------------------------------------------------------------------------

export const addCamera =
  (entry: CameraEntry): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    cameras: { ...registry.cameras, [entry.id]: entry },
  });

export const removeCameraById =
  (id: string): Endomorphism<LabRegistry> =>
  (registry) => {
    const { [id]: _removed, ...cameras } = registry.cameras;
    return { ...registry, cameras };
  };

export const updateCameraById =
  (id: string, update: Partial<Omit<CameraEntry, "id">>): Endomorphism<LabRegistry> =>
  (registry) => {
    const existing = registry.cameras[id];
    if (!existing) return registry;
    return { ...registry, cameras: { ...registry.cameras, [id]: { ...existing, ...update } } };
  };

export const findCameraById =
  (id: string) =>
  (registry: LabRegistry): CameraEntry | undefined =>
    registry.cameras[id];
