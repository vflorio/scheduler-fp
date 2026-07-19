import * as E from "fp-ts/Either";
import type { Endomorphism } from "fp-ts/Endomorphism";
import * as Eq from "fp-ts/Eq";
import { pipe } from "fp-ts/function";
import * as RA from "fp-ts/ReadonlyArray";
import * as S from "fp-ts/string";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import type * as Fs from "../fs";
import { type ValidationError, validate } from "../validation";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export const DeviceCategory = t.union([t.literal("control-unit"), t.literal("android-camera"), t.literal("smart-tv")]);

export type DeviceCategory = t.TypeOf<typeof DeviceCategory>;

export const DeviceEntryCodec = t.type({
  label: t.string,
  ip: t.string,
  category: DeviceCategory,
  controlled: t.boolean,
});

export type DeviceEntry = t.TypeOf<typeof DeviceEntryCodec>;

export const UpdateInputCodec = t.intersection([
  t.type({ ip: t.string }),
  t.partial({ label: t.string, controlled: t.boolean }),
]);

export type UpdateInput = t.TypeOf<typeof UpdateInputCodec>;

// -------------------------------------------------------------------------------------
// Identity
// -------------------------------------------------------------------------------------

export const EqByIp: Eq.Eq<DeviceEntry> = Eq.contramap((d: DeviceEntry) => d.ip)(S.Eq);

const RegistryCodec = t.type({
  devices: t.array(DeviceEntryCodec),
});

export type Registry = t.TypeOf<typeof RegistryCodec>;

// -------------------------------------------------------------------------------------
// Errors
// -------------------------------------------------------------------------------------

export type RegistryError = Fs.FileSystemError | ValidationError | ParseError;

export interface ParseError {
  readonly type: "ParseError";
  readonly message: string;
}

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

export const empty: Registry = { devices: [] };

// -------------------------------------------------------------------------------------
// Combinators (Endomorphisms)
// -------------------------------------------------------------------------------------

export const setDevices =
  (devices: readonly DeviceEntry[]): Endomorphism<Registry> =>
  () => ({ devices: [...devices] });

export const addDevice =
  (entry: DeviceEntry): Endomorphism<Registry> =>
  (registry) => ({ devices: [...registry.devices, entry] });

export const removeByIp =
  (ip: string): Endomorphism<Registry> =>
  (registry) => ({ devices: registry.devices.filter((d) => d.ip !== ip) });

export const updateByIp =
  (ip: string, update: Partial<Omit<DeviceEntry, "ip">>): Endomorphism<Registry> =>
  (registry) => ({
    devices: registry.devices.map((d) => (d.ip === ip ? { ...d, ...update } : d)),
  });

// -------------------------------------------------------------------------------------
// Queries
// -------------------------------------------------------------------------------------

export const byCategory =
  (category: DeviceCategory) =>
  (registry: Registry): readonly DeviceEntry[] =>
    registry.devices.filter((d) => d.category === category);

export const controlUnits: (registry: Registry) => readonly DeviceEntry[] = byCategory("control-unit");
export const androidCameras: (registry: Registry) => readonly DeviceEntry[] = byCategory("android-camera");
export const smartTvs: (registry: Registry) => readonly DeviceEntry[] = byCategory("smart-tv");

export const findByIp =
  (ip: string) =>
  (registry: Registry): DeviceEntry | undefined =>
    registry.devices.find((d) => d.ip === ip);

export const ips = (registry: Registry): readonly string[] => registry.devices.map((d) => d.ip);

export const ipsByCategory =
  (category: DeviceCategory) =>
  (registry: Registry): readonly string[] =>
    pipe(
      registry,
      byCategory(category),
      RA.map((d) => d.ip),
    );

export const controlledOnly = (registry: Registry): readonly DeviceEntry[] =>
  registry.devices.filter((d) => d.controlled);

export const controlledIpsByCategory =
  (category: DeviceCategory) =>
  (registry: Registry): readonly string[] =>
    pipe(
      registry,
      byCategory(category),
      RA.filter((d) => d.controlled),
      RA.map((d) => d.ip),
    );

// -------------------------------------------------------------------------------------
// Persistence: read(mutate(write))
// -------------------------------------------------------------------------------------

const parseJson = (raw: string): E.Either<ParseError, unknown> =>
  E.tryCatch(
    () => JSON.parse(raw),
    (e) => ({ type: "ParseError" as const, message: e instanceof Error ? e.message : String(e) }),
  );

export const read =
  (path: string): ((env: Fs.Env) => TE.TaskEither<RegistryError, Registry>) =>
  (env) =>
    pipe(env.readFile(path), TE.flatMapEither(parseJson), TE.flatMapEither(validate(RegistryCodec)));

export const write =
  (path: string) =>
  (registry: Registry): ((env: Fs.Env) => TE.TaskEither<RegistryError, void>) =>
  (env) =>
    env.writeFile(path, JSON.stringify(registry, null, 2));

export const modify =
  (path: string) =>
  (f: Endomorphism<Registry>): ((env: Fs.Env) => TE.TaskEither<RegistryError, Registry>) =>
  (env) =>
    pipe(
      read(path)(env),
      TE.map(f),
      TE.tap((updated) => write(path)(updated)(env)),
    );

// -------------------------------------------------------------------------------------
// Suitest mapping
// -------------------------------------------------------------------------------------

export const fromSuitestDevice = (
  device: { customName: string; ipAddress: string },
  category: DeviceCategory,
): DeviceEntry => ({
  category,
  label: device.customName,
  ip: device.ipAddress,
  controlled: false,
});

export const fromSuitestDevices = (
  devices: readonly { customName: string; ipAddress: string }[],
  category: DeviceCategory,
): readonly DeviceEntry[] => devices.map((d) => fromSuitestDevice(d, category));

// -------------------------------------------------------------------------------------
// Merge: sincronizza da Suitest preservando device locali e `controlled`
// -------------------------------------------------------------------------------------

const memberByIp = RA.elem(EqByIp);

export const mergeWithSuitest =
  (incoming: readonly DeviceEntry[]): Endomorphism<Registry> =>
  (existing) => {
    const existingByIp = new Map(existing.devices.map((d) => [d.ip, d]));

    const merged = incoming.map((device) => {
      const local = existingByIp.get(device.ip);
      return {
        ...device,
        label: device.label || device.ip,
        controlled: local?.controlled ?? device.controlled,
      };
    });

    const localOnly = existing.devices.filter((d) => !memberByIp(d)(incoming));

    return { devices: [...merged, ...localOnly] };
  };

export const syncFromSuitest =
  (path: string) =>
  (
    controlUnits: readonly { customName: string; ipAddress: string }[],
    cameras: readonly { customName: string; ipAddress: string }[],
    tvs: readonly { customName: string; ipAddress: string }[],
  ): ((env: Fs.Env) => TE.TaskEither<RegistryError, Registry>) =>
    modify(path)(
      mergeWithSuitest([
        ...fromSuitestDevices(controlUnits, "control-unit"),
        ...fromSuitestDevices(cameras, "android-camera"),
        ...fromSuitestDevices(tvs, "smart-tv"),
      ]),
    );

// -------------------------------------------------------------------------------------
// Init: crea il file se non esiste, altrimenti legge
// -------------------------------------------------------------------------------------

export const init =
  (path: string, seed?: readonly DeviceEntry[]): ((env: Fs.Env) => TE.TaskEither<RegistryError, Registry>) =>
  (env) =>
    pipe(
      read(path)(env),
      TE.orElse(() => {
        const initial: Registry =
          seed && seed.length > 0 ? { devices: seed.map((d) => ({ ...d, controlled: true })) } : empty;

        return pipe(
          write(path)(initial)(env),
          TE.map(() => initial),
        );
      }),
    );
