import * as t from "io-ts";
import { type CameraEntry, CameraEntryCodec } from "./camera";
import { type CandyboxEntry, CandyboxEntryCodec } from "./candybox";
import { type TvEntry, TvEntryCodec } from "./tv";

// -------------------------------------------------------------------------------------
// Model - dominio applicativo (supervisor): quali device della rete ci interessano, con che
// label mostrarli e se attualmente controllati, indipendentemente dai dati Suitest. L'unico
// legame verso Suitest è il campo opzionale `suitestId` di ciascuna entry (foreign key verso
// suitest-store), impostato manualmente in fase di riconciliazione via UI (tranne che per i
// control unit, la cui identità coincide con l'id Suitest).
// -------------------------------------------------------------------------------------

export const LabRegistryCodec = t.type({
  candyboxes: t.record(t.string, CandyboxEntryCodec),
  cameras: t.record(t.string, CameraEntryCodec),
  tvs: t.record(t.string, TvEntryCodec),
});

export type LabRegistry = t.TypeOf<typeof LabRegistryCodec>;

export const empty: LabRegistry = { candyboxes: {}, cameras: {}, tvs: {} };

export interface LabRegistrySeed {
  readonly candyboxes?: readonly CandyboxEntry[];
  readonly cameras?: readonly CameraEntry[];
  readonly tvs?: readonly TvEntry[];
}
