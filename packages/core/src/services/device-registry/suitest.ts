import type { Endomorphism } from "fp-ts/lib/Endomorphism";
import type * as TE from "fp-ts/TaskEither";
import type * as Fs from "../../fs";
import type { CameraEntry } from "./camera";
import type { ControlUnitEntry } from "./control-unit";
import { modify, type Registry, type RegistryError } from "./device-registry";
import type { TvEntry } from "./tv";

// -------------------------------------------------------------------------------------
// Mapping
// -------------------------------------------------------------------------------------

export const fromSuitestControlUnit = (controlUnit: {
  id: string;
  name: string;
  online: boolean;
}): ControlUnitEntry => ({
  id: controlUnit.id,
  label: controlUnit.name,
  online: controlUnit.online,
  controlled: false,
});

export const fromSuitestCamera = (device: { customName: string; ipAddress: string }): CameraEntry => ({
  label: device.customName,
  ip: device.ipAddress,
  controlled: false,
});

export const fromSuitestTv = (device: { customName: string; ipAddress: string }): TvEntry => ({
  label: device.customName,
  ip: device.ipAddress,
  controlled: false,
});

// -------------------------------------------------------------------------------------
// Merge
// -------------------------------------------------------------------------------------

// sincronizza da Suitest preservando lo stato locale (`controlled`)
const mergeBucket =
  <T extends { label: string; controlled: boolean }>(identity: (item: T) => string) =>
  (incoming: readonly T[], existing: readonly T[]): T[] => {
    const existingByKey = new Map(existing.map((d) => [identity(d), d]));

    const merged = incoming.map((device) => ({
      ...device,
      label: device.label || identity(device),
      controlled: existingByKey.get(identity(device))?.controlled ?? device.controlled,
    }));

    const incomingKeys = new Set(incoming.map(identity));
    const localOnly = existing.filter((d) => !incomingKeys.has(identity(d)));

    return [...merged, ...localOnly];
  };

export interface SuitestIncoming {
  readonly controlUnits: readonly ControlUnitEntry[];
  readonly cameras: readonly CameraEntry[];
  readonly tvs: readonly TvEntry[];
}

export const mergeWithSuitest =
  (incoming: SuitestIncoming): Endomorphism<Registry> =>
  (existing) => ({
    devices: {
      controlUnits: mergeBucket<ControlUnitEntry>((d) => d.id)(incoming.controlUnits, existing.devices.controlUnits),
      cameras: mergeBucket<CameraEntry>((d) => d.ip)(incoming.cameras, existing.devices.cameras),
      tvs: mergeBucket<TvEntry>((d) => d.ip)(incoming.tvs, existing.devices.tvs),
    },
  });

export const syncFromSuitest =
  (path: string) =>
  (incoming: {
    controlUnits: readonly { id: string; name: string; online: boolean }[];
    cameras: readonly { customName: string; ipAddress: string }[];
    tvs: readonly { customName: string; ipAddress: string }[];
  }): ((env: Fs.Env) => TE.TaskEither<RegistryError, Registry>) =>
    modify(path)(
      mergeWithSuitest({
        controlUnits: incoming.controlUnits.map(fromSuitestControlUnit),
        cameras: incoming.cameras.map(fromSuitestCamera),
        tvs: incoming.tvs.map(fromSuitestTv),
      }),
    );
