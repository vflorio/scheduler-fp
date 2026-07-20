import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import type { Registry } from "./device-registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export const CameraEntryCodec = t.type({
  label: t.string,
  ip: t.string,
  controlled: t.boolean,
});

export type CameraEntry = t.TypeOf<typeof CameraEntryCodec>;

export const CameraUpdateInputCodec = t.intersection([
  t.type({ ip: t.string }),
  t.partial({ label: t.string, controlled: t.boolean }),
]);

export type CameraUpdateInput = t.TypeOf<typeof CameraUpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Combinators - Cameras
// -------------------------------------------------------------------------------------

export const addCamera =
  (entry: CameraEntry): Endomorphism<Registry> =>
  (registry) => ({
    devices: { ...registry.devices, cameras: [...registry.devices.cameras, entry] },
  });

export const removeCameraByIp =
  (ip: string): Endomorphism<Registry> =>
  (registry) => ({
    devices: { ...registry.devices, cameras: registry.devices.cameras.filter((d) => d.ip !== ip) },
  });

export const updateCameraByIp =
  (ip: string, update: Partial<Omit<CameraEntry, "ip">>): Endomorphism<Registry> =>
  (registry) => ({
    devices: {
      ...registry.devices,
      cameras: registry.devices.cameras.map((d) => (d.ip === ip ? { ...d, ...update } : d)),
    },
  });

export const findCameraByIp =
  (ip: string) =>
  (registry: Registry): CameraEntry | undefined =>
    registry.devices.cameras.find((d) => d.ip === ip);

export const controlledCameraIps = (registry: Registry): readonly string[] =>
  registry.devices.cameras.filter((d) => d.controlled).map((d) => d.ip);
