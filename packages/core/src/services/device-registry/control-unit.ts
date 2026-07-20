import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import type { Registry } from "./device-registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export const ControlUnitEntryCodec = t.type({
  id: t.string,
  label: t.string,
  online: t.boolean,
  controlled: t.boolean,
});

export type ControlUnitEntry = t.TypeOf<typeof ControlUnitEntryCodec>;

export const ControlUnitUpdateInputCodec = t.intersection([
  t.type({ id: t.string }),
  t.partial({ label: t.string, controlled: t.boolean }),
]);

export type ControlUnitUpdateInput = t.TypeOf<typeof ControlUnitUpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Combinators - Control Units
// -------------------------------------------------------------------------------------

export const addControlUnit =
  (entry: ControlUnitEntry): Endomorphism<Registry> =>
  (registry) => ({
    devices: { ...registry.devices, controlUnits: [...registry.devices.controlUnits, entry] },
  });

export const removeControlUnitById =
  (id: string): Endomorphism<Registry> =>
  (registry) => ({
    devices: { ...registry.devices, controlUnits: registry.devices.controlUnits.filter((d) => d.id !== id) },
  });

export const updateControlUnitById =
  (id: string, update: Partial<Omit<ControlUnitEntry, "id">>): Endomorphism<Registry> =>
  (registry) => ({
    devices: {
      ...registry.devices,
      controlUnits: registry.devices.controlUnits.map((d) => (d.id === id ? { ...d, ...update } : d)),
    },
  });

export const findControlUnitById =
  (id: string) =>
  (registry: Registry): ControlUnitEntry | undefined =>
    registry.devices.controlUnits.find((d) => d.id === id);

export const controlledControlUnitIds = (registry: Registry): readonly string[] =>
  registry.devices.controlUnits.filter((d) => d.controlled).map((d) => d.id);
