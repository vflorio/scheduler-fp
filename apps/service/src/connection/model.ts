import type * as Socket from "@supervisor/core/socket";

// -------------------------------------------------------------------------------------
// Model - Target Machine (vedi apps/docs/docs/android-bridge.mdx#target-machine)
// -------------------------------------------------------------------------------------

// State machine: le decisioni di flusso (quale stato segue quale evento) sono un
// -riduttore puro e centralizzato, gli effetti (adb connect/tcpip/disconnect) sono isolati
// il ciclo comando -> effetto -> evento -> transizione è interpretato dal motore generico

export type TargetState =
  | { readonly _tag: "Unknown"; readonly host: string }
  | { readonly _tag: "Temporary"; readonly target: Socket.IPv4 }
  | { readonly _tag: "Persistent"; readonly target: Socket.IPv4 };

export const unknown = (host: string): TargetState => ({ _tag: "Unknown", host });
export const temporary = (target: Socket.IPv4): TargetState => ({ _tag: "Temporary", target });
export const persistent = (target: Socket.IPv4): TargetState => ({ _tag: "Persistent", target });

export const isPersistent = (state: TargetState): state is { _tag: "Persistent"; target: Socket.IPv4 } =>
  state._tag === "Persistent";

export type ConnectionEvent =
  | { readonly _tag: "TargetDiscovered"; readonly target: Socket.IPv4 }
  | { readonly _tag: "TemporaryHandshakeOk"; readonly target: Socket.IPv4 }
  | { readonly _tag: "TemporaryHandshakeFailed"; readonly reason: string }
  | { readonly _tag: "TcpipConfigured"; readonly persistentTarget: Socket.IPv4 }
  | { readonly _tag: "PersistentHandshakeOk"; readonly target: Socket.IPv4 }
  | { readonly _tag: "PersistentHandshakeFailed"; readonly reason: string }
  | { readonly _tag: "ConnectionLost" }
  | { readonly _tag: "PortChanged"; readonly target: Socket.IPv4 };

export type ConnectionCommand =
  | { readonly _tag: "ConnectTemporary"; readonly target: Socket.IPv4 }
  | { readonly _tag: "ConfigurePersistentPort"; readonly target: Socket.IPv4 }
  | { readonly _tag: "ConnectPersistent"; readonly target: Socket.IPv4 }
  | { readonly _tag: "DisconnectTemporary"; readonly target: Socket.IPv4 };
