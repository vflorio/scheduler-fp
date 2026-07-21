import type * as NetworkTarget from "@supervisor/core/network-target";

// -------------------------------------------------------------------------------------
// Model - Target Machine (vedi apps/docs/docs/android-bridge.mdx#target-machine)
// -------------------------------------------------------------------------------------

// State machine: le decisioni di flusso (quale stato segue quale evento) sono un
// -riduttore puro e centralizzato, gli effetti (adb connect/tcpip/disconnect) sono isolati
// il ciclo comando -> effetto -> evento -> transizione è interpretato dal motore generico

export type TargetState =
  | { readonly _tag: "Unknown"; readonly host: string }
  | { readonly _tag: "Temporary"; readonly target: NetworkTarget.Target }
  | { readonly _tag: "Persistent"; readonly target: NetworkTarget.Target };

export const unknown = (host: string): TargetState => ({ _tag: "Unknown", host });
export const temporary = (target: NetworkTarget.Target): TargetState => ({ _tag: "Temporary", target });
export const persistent = (target: NetworkTarget.Target): TargetState => ({ _tag: "Persistent", target });

export const isPersistent = (state: TargetState): state is { _tag: "Persistent"; target: NetworkTarget.Target } =>
  state._tag === "Persistent";

export type ConnectionEvent =
  | { readonly _tag: "TargetDiscovered"; readonly target: NetworkTarget.Target }
  | { readonly _tag: "TemporaryHandshakeOk"; readonly target: NetworkTarget.Target }
  | { readonly _tag: "TemporaryHandshakeFailed"; readonly reason: string }
  | { readonly _tag: "TcpipConfigured"; readonly persistentTarget: NetworkTarget.Target }
  | { readonly _tag: "PersistentHandshakeOk"; readonly target: NetworkTarget.Target }
  | { readonly _tag: "PersistentHandshakeFailed"; readonly reason: string }
  | { readonly _tag: "ConnectionLost" }
  | { readonly _tag: "PortChanged"; readonly target: NetworkTarget.Target };

export type ConnectionCommand =
  | { readonly _tag: "ConnectTemporary"; readonly target: NetworkTarget.Target }
  | { readonly _tag: "ConfigurePersistentPort"; readonly target: NetworkTarget.Target }
  | { readonly _tag: "ConnectPersistent"; readonly target: NetworkTarget.Target }
  | { readonly _tag: "DisconnectTemporary"; readonly target: NetworkTarget.Target };
