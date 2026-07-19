import type * as TE from "fp-ts/TaskEither";
import type * as Logger from "../logger";
import type * as Socket from "../socket";
import type { AdbError } from "./adb";

export interface AndroidBridgeError {
  readonly type: "AndroidBridgeError";
  readonly message: string;
}

export interface AndroidBridge {
  readonly devices: () => TE.TaskEither<AdbError, readonly { target: string; status: string }[]>;
  readonly reboot: (target: Socket.IPv4) => TE.TaskEither<AdbError, void>;
}

// biome-ignore lint/suspicious/noEmptyInterface: <wip>
export interface MdnsDiscovery {}

// biome-ignore lint/suspicious/noEmptyInterface: <wip>
export interface Notifications {}

// biome-ignore lint/suspicious/noEmptyInterface: <wip>
export interface DeviceRegistry {}

export interface Services {
  readonly android: AndroidBridge;
  readonly mdns: MdnsDiscovery;
  readonly registry: DeviceRegistry;
  readonly notifications: Notifications;
  // Questo serve per permettere di avere in logger transportato in HTTP (per loggare errori critici delle web-app)
  readonly logger: Logger.Tagged;
}
