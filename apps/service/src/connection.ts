import * as AdbCore from "@supervisor/core/adb";
import * as AdbShell from "@supervisor/shell/adb";
import * as Mdns from "@supervisor/shell/mdns";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as RTE from "fp-ts/ReaderTaskEither";
import * as RA from "fp-ts/ReadonlyArray";
import * as TE from "fp-ts/TaskEither";
import type { Logger } from "./logger";

// -------------------------------------------------------------------------------------
// Model
// -------------------------------------------------------------------------------------

export interface Env {
  readonly logger: Logger;
  readonly adbPort: number;
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

const connect = (setupTarget: AdbCore.Target): Effect<void> =>
  pipe(
    RTE.ask<Env>(),
    RTE.tap(({ adbPort }) => logInfo(`Connecting to ${setupTarget} with persistent port ${adbPort}`)),

    // Step 1: Connect with temporary TCP port
    RTE.tap(() => RTE.fromTaskEither(AdbShell.connect(setupTarget))),
    RTE.tap(() => logInfo(`Connected to ${setupTarget}`)),
    RTE.tapError((error) => logError(`Failed to connect to ${setupTarget}: ${error.message}`)),

    // Step 2: Set TCP port to persistent adb port (default 5555) and establish persistent connection
    RTE.tap(({ adbPort }) => RTE.fromTaskEither(AdbShell.tcpip(setupTarget, adbPort))),
    RTE.tap(({ adbPort }) => logInfo(`Set TCP port to ${adbPort} for ${setupTarget}`)),
    RTE.tapError((error) => logError(`Failed to set TCP port for ${setupTarget}: ${error.message}`)),

    // Step 3: Disconnect temporary connection
    RTE.tap(() => RTE.fromTaskEither(AdbShell.disconnect(setupTarget))),
    RTE.tap(() => logInfo(`Disconnected temporary connection for ${setupTarget}`)),
    RTE.tapError((error) => logError(`Failed to disconnect temporary connection for ${setupTarget}: ${error.message}`)),

    // Step 4: Connect with persistent ADB TCP port
    RTE.map(({ adbPort }) => AdbCore.withPort(setupTarget, adbPort)),
    RTE.tap((persistentTarget) =>
      pipe(
        RTE.fromTaskEither(AdbShell.connect(persistentTarget)),
        RTE.tap(() => logInfo(`Connected to ${persistentTarget}`)),
        RTE.tapError((error) => logError(`Failed to connect to ${persistentTarget}: ${error.message}`)),
      ),
    ),

    RTE.asUnit,
  );

export const disconnect = (target: AdbCore.Target): Effect<void> =>
  pipe(
    RTE.fromTaskEither(AdbShell.disconnect(target)),
    RTE.flatMap(() => logInfo(`Disconnected ${target}`)),
    RTE.tapError((error) => logError(`Failed to disconnect ${target}: ${error.message}`)),
  );

const filterValidEndpoints = (endpoints: readonly Mdns.Endpoint[]): Effect<readonly AdbCore.Target[]> =>
  pipe(endpoints.map(toTarget), RA.rights, RTE.of);

const filterDisconnected = (targets: readonly AdbCore.Target[]): Effect<readonly AdbCore.Target[]> =>
  RTE.fromTaskEither(
    pipe(
      TE.sequenceSeqArray(targets.map(AdbShell.isConnected)),
      TE.map(RA.zip(targets)),
      TE.map(RA.filter(([connected]) => !connected)),
      TE.map(RA.map(([, target]) => target)),
    ),
  );

// -------------------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------------------

export const discoverAndConnect: Effect<readonly AdbCore.Target[]> = pipe(
  logInfo("Starting mDNS discovery"),
  RTE.flatMap(() => RTE.fromTaskEither(Mdns.discoverDefaultAdbTslConnect)),
  RTE.tapError((error) => logError(`mDNS discovery failed: ${error.message}`)),
  RTE.flatMap(filterValidEndpoints),
  RTE.flatMap(filterDisconnected),
  RTE.tap((targets) => RTE.sequenceSeqArray(targets.map(connect))),
  RTE.tap(() => logInfo(`Discovery complete`)),
  RTE.tapError((error) => logError(`Failed to connect to targets: ${error.message}`)),
);
