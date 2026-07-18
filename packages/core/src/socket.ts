import * as E from "fp-ts/Either";
import type { Endomorphism } from "fp-ts/Endomorphism";
import * as Eq from "fp-ts/Eq";
import { pipe } from "fp-ts/lib/function";
import * as S from "fp-ts/string";
import * as t from "io-ts";

// -------------------------------------------------------------------------------------
// Model - validated "host:port" string
// -------------------------------------------------------------------------------------

export type IPv4 = `${string}:${number}`;

export interface Ipv4Error {
  readonly type: "Ipv4Error";
  readonly message: string;
}

const IPV4_REGEX = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/;

const isValid = (u: unknown): u is IPv4 => typeof u === "string" && IPV4_REGEX.test(u);

const validate = (u: unknown, c: t.Context): t.Validation<IPv4> =>
  isValid(u) ? t.success(u) : t.failure(u, c, "Expected: <host>:<port> (e.g. 192.168.0.1:1234)");

export const Codec = new t.Type<IPv4, IPv4, unknown>("AdbTarget", isValid, validate, t.identity);

export const decode = (s: string): E.Either<Ipv4Error, IPv4> =>
  pipe(
    Codec.decode(s),
    E.mapLeft(() => ({ type: "Ipv4Error" as const, message: `Invalid ipv4: ${s}` })),
  );

// Conversion

export const from = (target: IPv4): { host: string; port: number } => {
  const [host = "", portStr = ""] = target.split(":");
  return { host, port: Number(portStr) };
};

// Equality

export const EqByHost: Eq.Eq<IPv4> = Eq.contramap((target: IPv4) => from(target).host)(S.Eq);

// -------------------------------------------------------------------------------------
// Constructors
// -------------------------------------------------------------------------------------

export const toTarget = (host: string, port: number): IPv4 => `${host}:${port}`;

export const withPort =
  (persistentPort: number): Endomorphism<IPv4> =>
  (target) =>
    toTarget(from(target).host, persistentPort);

export const withHost =
  (host: string): Endomorphism<IPv4> =>
  (target) =>
    toTarget(host, from(target).port);
