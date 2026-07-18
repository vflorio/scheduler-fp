import type { Endomorphism } from "fp-ts/Endomorphism";
import * as Eq from "fp-ts/Eq";
import * as O from "fp-ts/Option";
import * as S from "fp-ts/string";
import * as t from "io-ts";
import { match, P } from "ts-pattern";

export type DeviceState =
  | "device"
  | "recovery"
  | "rescue"
  | "sideload"
  | "bootloader"
  | "disconnect"
  | "offline"
  | "unknown";

export const matchDeviceState = (raw: string): O.Option<DeviceState> =>
  match(raw)
    .with(
      P.union("device", "recovery", "rescue", "sideload", "bootloader", "disconnect", "offline"),
      (s): O.Option<DeviceState> => O.some(s),
    )
    .otherwise(() => O.none);

export interface AdbError {
  readonly type: "AdbError";
  readonly message: string;
}

// -------------------------------------------------------------------------------------
// Target - validated "host:port" string
// -------------------------------------------------------------------------------------

export type Target = `${string}:${number}`;

const ADB_IPV4_TARGET_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/;

export const isTarget = (u: unknown): u is Target => typeof u === "string" && ADB_IPV4_TARGET_REGEX.test(u);

const validateAdbTarget = (u: unknown, c: t.Context): t.Validation<Target> =>
  isTarget(u) ? t.success(u) : t.failure(u, c, "Expected: <host>:<port> (e.g. 192.168.1.4:5555)");

export const Target = new t.Type<Target, Target, unknown>("AdbTarget", isTarget, validateAdbTarget, t.identity);

export const toTarget = (host: string, port: number): Target => `${host}:${port}`;

export const fromTarget = (target: Target): { host: string; port: number } => {
  const [host = "", portStr = ""] = target.split(":");
  return { host, port: Number(portStr) };
};

export const EqByHost: Eq.Eq<Target> = Eq.contramap((t: Target) => fromTarget(t).host)(S.Eq);

export const withPort =
  (persistentPort: number): Endomorphism<Target> =>
  (target) =>
    toTarget(fromTarget(target).host, persistentPort);

export const withHost =
  (host: string): Endomorphism<Target> =>
  (target) =>
    toTarget(host, fromTarget(target).port);
