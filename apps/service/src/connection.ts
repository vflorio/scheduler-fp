import * as AdbCore from "@supervisor/core/adb";
import * as Retry from "@supervisor/core/retry";
import * as AdbShell from "@supervisor/shell/adb";
import * as Mdns from "@supervisor/shell/mdns";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as T from "fp-ts/Task";
import * as TE from "fp-ts/TaskEither";
import type { TaggedLogger } from "./logger";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Env {
  readonly logger: TaggedLogger;
  readonly adbPort: number;
  readonly adbReconnectPolicy: Retry.Policy;
}

type Effect<A> = RTE.ReaderTaskEither<Env, AdbCore.AdbError | Mdns.DiscoverError, A>;

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

const toTarget = (endpoint: Mdns.Endpoint): E.Either<AdbCore.AdbError, AdbCore.Target> =>
  pipe(
    AdbCore.Target.decode(`${endpoint.ip}:${endpoint.port}`),
    E.mapLeft(() => ({ type: "AdbError" as const, message: `Invalid endpoint: ${endpoint.ip}:${endpoint.port}` })),
  );

const delay = (ms: number): Effect<void> => RTE.fromTaskEither(TE.fromTask(T.delay(ms)(T.of(undefined))));

// Lift AdbShell RTE (requires AdbShellEnv) into our Effect (requires Env)
const liftAdb =
  <A>(effect: RTE.ReaderTaskEither<AdbShell.AdbShellEnv, AdbCore.AdbError, A>): Effect<A> =>
  (env) =>
    effect({ logger: env.logger });

const connect = (setupTarget: AdbCore.Target): Effect<void> =>
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
      const persistentTarget = AdbCore.withPort(adbPort)(setupTarget);
      return pipe(
        RTE.fromTaskEither(Retry.retrying(adbReconnectPolicy)(AdbShell.connect(persistentTarget)({ logger }))),
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
const getConnectedAdbDevices: Effect<readonly AdbCore.Target[]> = pipe(
  liftAdb(AdbShell.devices),
  RTE.map((ds) => ds.filter((d) => d.status === "device").map((d) => d.target)),
);

// Map mDNS endpoint to ADB Target, filtering out invalid ones
const filterMapValidEndpoints = (endpoints: readonly Mdns.Endpoint[]): Effect<readonly AdbCore.Target[]> =>
  pipe(endpoints.map(toTarget), RA.rights, RTE.of);

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

export const discoverAndConnect: Effect<readonly AdbCore.Target[]> = pipe(
  logInfo("Starting mDNS discovery"),

  // Discovery connected ADB devices
  RTE.bind("connected", () => getConnectedAdbDevices),
  RTE.tap(({ connected }) =>
    connected.length > 0
      ? logInfo(`Already connected hosts: ${connected.map((target) => AdbCore.fromTarget(target).host).join(", ")}`)
      : logInfo("No already connected hosts"),
  ),

  // Discover new devices via mDNS
  RTE.bind("discovered", () =>
    pipe(
      RTE.fromTaskEither(Mdns.discoverDefaultAdbTslConnect),
      RTE.tapError((error) => logError(`mDNS discovery failed: ${error.message}`)),
      RTE.flatMap(filterMapValidEndpoints),
    ),
  ),

  // Filter out already connected (by host), connect new ones
  RTE.bind("newTargets", ({ connected, discovered }) => RTE.of(RA.difference(AdbCore.EqByHost)(connected)(discovered))),
  RTE.tap(({ newTargets }) =>
    newTargets.length > 0
      ? logInfo(`New targets to connect: ${JSON.stringify(newTargets)}`)
      : logInfo("No new targets to connect"),
  ),

  RTE.tap(({ newTargets }) => RTE.sequenceSeqArray(newTargets.map(connect))),
  RTE.tapError((error) => logError(`Failed to connect to targets: ${error.message}`)),

  // Return persistent targets: already connected + newly connected (all with persistent port)
  RTE.flatMap(({ connected, newTargets }) =>
    RTE.asks<Env, readonly AdbCore.Target[]>(({ adbPort }) => [
      ...connected,
      ...newTargets.map(AdbCore.withPort(adbPort)),
    ]),
  ),

  RTE.tap(() => logInfo("Discovery complete")),
);
