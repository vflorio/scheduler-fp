import type * as Adb from "@supervisor/core/adb";
import type * as Logger from "@supervisor/core/logger";
import * as Retry from "@supervisor/core/retry";
import * as Socket from "@supervisor/core/socket";
import * as AdbShell from "@supervisor/shell/adb";
import * as AvahiBrowse from "@supervisor/shell/avahi-browse";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Env {
  readonly logger: Logger.Tagged;
  readonly adbPort: number;
  readonly adbReconnectPolicy: Retry.Policy;
}

type Effect<A> = RTE.ReaderTaskEither<Env, Adb.AdbError | AvahiBrowse.DiscoverError, A>;

// -------------------------------------------------------------------------------------
// Internals
// -------------------------------------------------------------------------------------

const logInfo =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.info(message));

const logError =
  (message: string): Effect<void> =>
  ({ logger }) =>
    TE.fromIO(logger.error(message));

const delay = (ms: number): Effect<void> => RTE.fromTaskEither(TE.fromTask(T.delay(ms)(T.of(undefined))));

// Lift AdbShell RTE (requires AdbShellEnv) into our Effect (requires Env)
const liftAdb =
  <A>(effect: RTE.ReaderTaskEither<AdbShell.AdbShellEnv, Adb.AdbError, A>): Effect<A> =>
  (env) =>
    effect({ logger: env.logger.child("AdbShell") });

// Lift Mdns RTE (requires MdnsShellEnv) into our Effect (requires Env)
const liftMdns =
  <A>(effect: RTE.ReaderTaskEither<AvahiBrowse.MdnsShellEnv, AvahiBrowse.DiscoverError, A>): Effect<A> =>
  (env) =>
    effect({ logger: env.logger.child("Mdns") });

const connect = (setupTarget: Socket.IPv4): Effect<void> =>
  pipe(
    RTE.ask<Env>(),
    RTE.tap(({ adbPort }) => logInfo(`Connecting to ${setupTarget} with persistent port ${adbPort}`)),

    // Step 1: Connessione via porta ADB temporanea (cambia ad ogni reboot)
    RTE.tap(() => liftAdb(AdbShell.connect(setupTarget))),
    RTE.tap(() => logInfo(`Connected to ${setupTarget}`)),
    RTE.tapError((error) => logError(`Failed to connect to ${setupTarget}: ${error.message}`)),

    // Step 2: Imposta una porta statica persistente
    RTE.tap(({ adbPort }) => liftAdb(AdbShell.tcpip(adbPort)(setupTarget))),
    RTE.tap(({ adbPort }) => logInfo(`Set TCP port to ${adbPort} for ${setupTarget}`)),
    RTE.tapError((error) => logError(`Failed to set TCP port for ${setupTarget}: ${error.message}`)),

    // Step 3: Delay per dare tempo ad adbd di riavviarsi, poi connect con retry policy
    RTE.tap(() => delay(1000)),
    RTE.tap(() => logInfo("Waited 1s for adbd restart")),
    RTE.flatMap(({ adbPort, adbReconnectPolicy, logger }) => {
      const persistentTarget = Socket.withPort(adbPort)(setupTarget);
      return pipe(
        RTE.fromTaskEither(Retry.retrying(adbReconnectPolicy, logger)(AdbShell.connect(persistentTarget)({ logger }))),
        RTE.tap(() => logInfo(`Connected to ${persistentTarget}`)),
        RTE.tapError((error) => logError(`Failed to connect to ${persistentTarget}: ${error.message}`)),
      );
    }),

    // Step 4: Disconnessione dalla porta ADB temporanea (non più necessaria)
    RTE.tap(() => liftAdb(AdbShell.disconnect(setupTarget))),
    RTE.tap(() => logInfo(`Disconnected temporary connection for ${setupTarget}`)),
    RTE.tapError((error) => logError(`Failed to disconnect temporary connection for ${setupTarget}: ${error.message}`)),

    RTE.asUnit,
  );

// Get the targets that are already connected via ADB
const getConnectedAdbDevices: Effect<readonly Socket.IPv4[]> = pipe(
  liftAdb(AdbShell.devices),
  RTE.map((ds) => ds.filter((d) => d.status === "device").map((d) => d.target)),
);

// Map mDNS endpoint to ADB Target, filtering out invalid ones
const filterMapValidEndpoints = (endpoints: readonly AvahiBrowse.Endpoint[]): Effect<readonly Socket.IPv4[]> =>
  pipe(
    endpoints.map((e) => Socket.decode(`${e.ip}:${e.port}`)),
    RA.rights,
    RTE.of,
  );

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

export const discoverAndConnect: Effect<readonly Socket.IPv4[]> = pipe(
  logInfo("Starting mDNS discovery"),

  // Discovery connected ADB devices
  RTE.bind("connected", () => getConnectedAdbDevices),
  RTE.tap(({ connected }) =>
    connected.length > 0
      ? logInfo(`Already connected hosts: ${connected.map((target) => Socket.from(target).host).join(", ")}`)
      : logInfo("No already connected hosts"),
  ),

  // Discover new devices via mDNS
  RTE.bind("discovered", () =>
    pipe(
      liftMdns(AvahiBrowse.discoverDefaultAdbTslConnect),
      RTE.tapError((error) => logError(`mDNS discovery failed: ${error.message}`)),
      RTE.flatMap(filterMapValidEndpoints),
    ),
  ),

  // Filter out already connected (by host), connect new ones
  RTE.bind("newTargets", ({ connected, discovered }) => RTE.of(RA.difference(Socket.EqByHost)(connected)(discovered))),
  RTE.tap(({ newTargets }) =>
    newTargets.length > 0
      ? logInfo(`New targets to connect: ${JSON.stringify(newTargets)}`)
      : logInfo("No new targets to connect"),
  ),

  RTE.tap(({ newTargets }) => RTE.sequenceSeqArray(newTargets.map(connect))),
  RTE.tapError((error) => logError(`Failed to connect to targets: ${error.message}`)),

  // Return persistent targets: already connected + newly connected (all with persistent port)
  RTE.flatMap(({ connected, newTargets }) =>
    RTE.asks<Env, readonly Socket.IPv4[]>(({ adbPort }) => [...connected, ...newTargets.map(Socket.withPort(adbPort))]),
  ),

  RTE.tap(() => logInfo("Discovery complete")),
);
