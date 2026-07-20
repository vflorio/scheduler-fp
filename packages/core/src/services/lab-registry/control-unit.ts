import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import type { ControlUnit } from "../suitest";
import type { LabRegistry } from "./registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

// Identità = id Suitest: un control unit (CandyBox/Raspberry Pi) non ha esistenza indipendente
// da Suitest (a differenza di TV/Camera non può essere preconfigurato offline), quindi non serve
// una foreign key separata: `id` qui È l'id Suitest.
export const ControlUnitEntryCodec = t.type({
  id: t.string,
  label: t.string,
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
  (entry: ControlUnitEntry): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    controlUnits: { ...registry.controlUnits, [entry.id]: entry },
  });

export const removeControlUnitById =
  (id: string): Endomorphism<LabRegistry> =>
  (registry) => {
    const { [id]: _removed, ...controlUnits } = registry.controlUnits;
    return { ...registry, controlUnits };
  };

export const updateControlUnitById =
  (id: string, update: Partial<Omit<ControlUnitEntry, "id">>): Endomorphism<LabRegistry> =>
  (registry) => {
    const existing = registry.controlUnits[id];
    if (!existing) return registry;
    return { ...registry, controlUnits: { ...registry.controlUnits, [id]: { ...existing, ...update } } };
  };

export const findControlUnitById =
  (id: string) =>
  (registry: LabRegistry): ControlUnitEntry | undefined =>
    registry.controlUnits[id];

export const controlledControlUnitIds = (registry: LabRegistry): readonly string[] =>
  Object.values(registry.controlUnits)
    .filter((d) => d.controlled)
    .map((d) => d.id);

// Auto-import dalla sync Suitest: a differenza di TV/Camera l'identità coincide con quella
// Suitest, quindi non serve riconciliazione manuale via UI. Le entry esistenti mantengono
// label/controlled locali; i control unit nuovi vengono aggiunti con controlled:false.
export const upsertControlUnitsFromSuitest =
  (controlUnits: readonly ControlUnit[]): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    controlUnits: {
      ...registry.controlUnits,
      ...Object.fromEntries(
        controlUnits.map((cu) => [
          cu.id,
          registry.controlUnits[cu.id] ?? { id: cu.id, label: cu.name, controlled: false },
        ]),
      ),
    },
  });
