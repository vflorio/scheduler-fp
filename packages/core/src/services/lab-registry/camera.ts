import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import * as NetworkTarget from "../../network-target";
import type { LabRegistry } from "./registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export const CameraEntryCodec = t.intersection([
  t.type({
    id: t.string,
    label: t.string,
    controlled: t.boolean,
  }),
  t.partial({
    adbTarget: NetworkTarget.Codec, // "host:port" ADB assegnato manualmente (es. un tablet)
    // Foreign key verso suitest-store.videoCaptureDevices[suitestId], impostata manualmente in
    // fase di riconciliazione via UI (una camera aggiunta a mano, es. un tablet, può non averla)
    suitestId: t.string,
  }),
]);

export type CameraEntry = t.TypeOf<typeof CameraEntryCodec>;

export const CameraUpdateInputCodec = t.intersection([
  t.type({ id: t.string }),
  t.partial({ label: t.string, controlled: t.boolean, adbTarget: NetworkTarget.Codec, suitestId: t.string }),
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
