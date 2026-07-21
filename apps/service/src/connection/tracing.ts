import * as NetworkTarget from "@supervisor/core/network-target";
import type * as Machine from "@supervisor/core/state-machine/machine";
import * as TE from "fp-ts/TaskEither";
import { match } from "ts-pattern";
import type { ConnectionEnv } from "./handle";
import type { ConnectionEvent, TargetState } from "./model";

// -------------------------------------------------------------------------------------
// Tracing - visibilità automatica sulle transizioni di fase (debugging)
// -------------------------------------------------------------------------------------
// Logga solo quando cambia la "fase" (`_tag`): i passaggi interni alla stessa fase
// (es. handshake temporaneo ok -> configura tcpip) non generano rumore.

const describeState = (state: TargetState): string =>
  match(state)
    .with({ _tag: "Unknown" }, (s) => `Unknown(${s.host})`)
    .with({ _tag: "Temporary" }, (s) => `Temporary(${NetworkTarget.format(s.target)})`)
    .with({ _tag: "Persistent" }, (s) => `Persistent(${NetworkTarget.format(s.target)})`)
    .exhaustive();

const describeEvent = (event: ConnectionEvent): string =>
  match(event)
    .with({ _tag: "TargetDiscovered" }, (e) => `TargetDiscovered(${NetworkTarget.format(e.target)})`)
    .with({ _tag: "TemporaryHandshakeOk" }, (e) => `TemporaryHandshakeOk(${NetworkTarget.format(e.target)})`)
    .with({ _tag: "TemporaryHandshakeFailed" }, (e) => `TemporaryHandshakeFailed(${e.reason})`)
    .with({ _tag: "TcpipConfigured" }, (e) => `TcpipConfigured(${NetworkTarget.format(e.persistentTarget)})`)
    .with({ _tag: "PersistentHandshakeOk" }, (e) => `PersistentHandshakeOk(${NetworkTarget.format(e.target)})`)
    .with({ _tag: "PersistentHandshakeFailed" }, (e) => `PersistentHandshakeFailed(${e.reason})`)
    .with({ _tag: "ConnectionLost" }, () => "ConnectionLost")
    .with({ _tag: "PortChanged" }, (e) => `PortChanged(${NetworkTarget.format(e.target)})`)
    .exhaustive();

// Tornare a Unknown da una fase più avanzata è una regressione (persa la connessione o
// fallito l'handshake)
const isRegression = (from: TargetState, to: TargetState): boolean => from._tag !== "Unknown" && to._tag === "Unknown";

export const onTransition: Machine.TransitionHook<ConnectionEnv, never, TargetState, ConnectionEvent> =
  (from, event, to) => (env) =>
    from._tag === to._tag
      ? TE.right(undefined)
      : TE.fromIO(
          (isRegression(from, to)
            ? //
              env.logger.child("Connection").error
            : env.logger.child("Connection").info)(
            `Event = [${describeEvent(event)}] | Transition = [${describeState(from)} -> ${describeState(to)}]`,
          ),
        );
