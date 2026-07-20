import type { Endomorphism } from "fp-ts/Endomorphism";
import * as t from "io-ts";
import type { Registry } from "./device-registry";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export const TvEntryCodec = t.type({
  label: t.string,
  ip: t.string,
  controlled: t.boolean,
});

export type TvEntry = t.TypeOf<typeof TvEntryCodec>;

export const TvUpdateInputCodec = t.intersection([
  t.type({ ip: t.string }),
  t.partial({ label: t.string, controlled: t.boolean }),
]);

export type TvUpdateInput = t.TypeOf<typeof TvUpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Combinators - TVs
// -------------------------------------------------------------------------------------

export const addTv =
  (entry: TvEntry): Endomorphism<Registry> =>
  (registry) => ({
    devices: { ...registry.devices, tvs: [...registry.devices.tvs, entry] },
  });

export const removeTvByIp =
  (ip: string): Endomorphism<Registry> =>
  (registry) => ({
    devices: { ...registry.devices, tvs: registry.devices.tvs.filter((d) => d.ip !== ip) },
  });

export const updateTvByIp =
  (ip: string, update: Partial<Omit<TvEntry, "ip">>): Endomorphism<Registry> =>
  (registry) => ({
    devices: {
      ...registry.devices,
      tvs: registry.devices.tvs.map((d) => (d.ip === ip ? { ...d, ...update } : d)),
    },
  });

export const findTvByIp =
  (ip: string) =>
  (registry: Registry): TvEntry | undefined =>
    registry.devices.tvs.find((d) => d.ip === ip);

export const controlledTvIps = (registry: Registry): readonly string[] =>
  registry.devices.tvs.filter((d) => d.controlled).map((d) => d.ip);
