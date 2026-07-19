import * as Adb from "@supervisor/core/services/adb";
import * as AvahiBrowse from "@supervisor/core/services/avahi-browse";
import type * as Shell from "@supervisor/core/shell";
import * as Socket from "@supervisor/core/socket";
import * as Machine from "@supervisor/core/state-machine/machine";
import { pipe } from "fp-ts/function";
import type { Predicate } from "fp-ts/Predicate";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import type { ConnectionEnv } from "./handle";
import { handle } from "./handle";
import type { ConnectionCommand, ConnectionEvent, TargetState } from "./model";
import { isPersistent, unknown } from "./model";
import { reduce } from "./reduce";
import { onTransition } from "./tracing";

export const machine: Machine.Machine<ConnectionEnv, never, TargetState, ConnectionEvent, ConnectionCommand> =
  Machine.make(reduce, handle, onTransition);

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

export interface Env extends ConnectionEnv {
  readonly isControlled: Predicate<Socket.IPv4>;
}

export type DiscoveryError = Adb.AdbError | AvahiBrowse.AvahiBrowseError | Shell.ShellSpawnError;

type Effect<A> = RTE.ReaderTaskEither<Env, DiscoveryError, A>;

const logInfo =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.info(message));

const logError =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.error(message));

const liftMdns =
  <A>(
    effect: RTE.ReaderTaskEither<AvahiBrowse.AvahiBrowseEnv, AvahiBrowse.AvahiBrowseError | Shell.ShellSpawnError, A>,
  ): Effect<A> =>
  (env) =>
    effect({ logger: env.logger.child("mDNS"), spawn: env.spawn });

const getConnectedAdbDevices: Effect<readonly Socket.IPv4[]> = (env) =>
  pipe(
    Adb.devices({ logger: env.logger.child("ADB"), spawn: env.spawn }),
    TE.map((devices) => devices.filter((d) => d.status === "device").map((d) => d.target)),
  );

const filterControlledOnly =
  (devices: readonly Socket.IPv4[]): Effect<readonly Socket.IPv4[]> =>
  ({ isControlled }) =>
    TE.right(devices.filter(isControlled));

// Applica un singolo device (già scoperto via mDNS) alla Target Machine, partendo da
// Unknown, e ne ritorna lo stato finale (Persistent se la connessione ha avuto successo,
// Unknown se ha fallito - vedi `reduce`/`handle`, che catchano i propri errori).
const connect = (target: Socket.IPv4): Effect<TargetState> =>
  Machine.dispatch(machine)(unknown(Socket.from(target).host), { _tag: "TargetDiscovered", target });

export const discoverAndConnect: Effect<readonly Socket.IPv4[]> = pipe(
  logInfo("Starting mDNS discovery"),

  RTE.bind("connected", () => pipe(getConnectedAdbDevices, RTE.flatMap(filterControlledOnly))),
  RTE.tap(({ connected }) =>
    connected.length > 0
      ? logInfo(`Already connected hosts: ${connected.map((target) => Socket.from(target).host).join(", ")}`)
      : logInfo("No already connected hosts"),
  ),

  RTE.bind("discovered", () =>
    pipe(
      liftMdns(AvahiBrowse.discoverAdbTlsConnect),
      RTE.flatMap(filterControlledOnly),
      RTE.tapError((error) => logError(`mDNS discovery failed: ${error.message}`)),
    ),
  ),

  RTE.bind("newTargets", ({ connected, discovered }) => RTE.of(RA.difference(Socket.EqByHost)(connected)(discovered))),
  RTE.tap(({ newTargets }) =>
    newTargets.length > 0
      ? logInfo(`New targets to connect: ${JSON.stringify(newTargets)}`)
      : logInfo("No new targets to connect"),
  ),

  // Processiamo i devices in modo sequenziale (1 a 1)
  RTE.bind("resolved", ({ newTargets }) => RTE.sequenceSeqArray(newTargets.map(connect))),

  RTE.tap(({ connected, discovered, newTargets, resolved }) =>
    logInfo(`Discovery complete\n${JSON.stringify({ connected, discovered, newTargets, resolved }, null, 2)}`),
  ),

  RTE.map(({ connected, resolved }) => [...connected, ...resolved.filter(isPersistent).map((s) => s.target)]),
);
