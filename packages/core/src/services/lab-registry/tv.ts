import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import type { LabRegistry } from "./registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export const TvEntryCodec = t.intersection([
  t.type({
    ip: t.string,
    label: t.string,
    controlled: t.boolean,
  }),
  t.partial({
    // Foreign key verso suitest-store.devices[suitestId], impostata manualmente in fase di
    // riconciliazione via UI (accoppia il deviceId Suitest alla TV identificata per ip)
    suitestId: t.string,
  }),
]);

export type TvEntry = t.TypeOf<typeof TvEntryCodec>;

export const TvUpdateInputCodec = t.intersection([
  t.type({ ip: t.string }),
  t.partial({ label: t.string, controlled: t.boolean, suitestId: t.string }),
]);

export type TvUpdateInput = t.TypeOf<typeof TvUpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Combinators - TVs
// -------------------------------------------------------------------------------------

export const addTv =
  (entry: TvEntry): Endomorphism<LabRegistry> =>
  (registry) => ({
    ...registry,
    tvs: { ...registry.tvs, [entry.ip]: entry },
  });

export const removeTvByIp =
  (ip: string): Endomorphism<LabRegistry> =>
  (registry) => {
    const { [ip]: _removed, ...tvs } = registry.tvs;
    return { ...registry, tvs };
  };

export const updateTvByIp =
  (ip: string, update: Partial<Omit<TvEntry, "ip">>): Endomorphism<LabRegistry> =>
  (registry) => {
    const existing = registry.tvs[ip];
    if (!existing) return registry;
    return { ...registry, tvs: { ...registry.tvs, [ip]: { ...existing, ...update } } };
  };

export const findTvByIp =
  (ip: string) =>
  (registry: LabRegistry): TvEntry | undefined =>
    registry.tvs[ip];
