import type * as TE from "fp-ts/TaskEither";
import type * as Logger from "../logger";
import type * as Socket from "../socket";
import type { AdbError } from "./adb";
import type * as Registry from "./device-registry/device-registry";

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

export interface DeviceRegistry {
  readonly getAll: () => TE.TaskEither<Registry.RegistryError, Registry.Registry>;

  readonly controlUnits: {
    readonly update: (
      id: string,
      update: Partial<Pick<Registry.ControlUnitEntry, "label" | "controlled">>,
    ) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
    readonly add: (entry: Registry.ControlUnitEntry) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
    readonly remove: (id: string) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
  };

  readonly cameras: {
    readonly update: (
      ip: string,
      update: Partial<Pick<Registry.CameraEntry, "label" | "controlled">>,
    ) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
    readonly add: (entry: Registry.CameraEntry) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
    readonly remove: (ip: string) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
  };

  readonly tvs: {
    readonly update: (
      ip: string,
      update: Partial<Pick<Registry.TvEntry, "label" | "controlled">>,
    ) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
    readonly add: (entry: Registry.TvEntry) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
    readonly remove: (ip: string) => TE.TaskEither<Registry.RegistryError, Registry.Registry>;
  };
}

export interface Services {
  readonly android: AndroidBridge;
  readonly mdns: MdnsDiscovery;
  readonly registry: DeviceRegistry;
  readonly notifications: Notifications;
  // Questo serve per permettere di avere in logger transportato in HTTP (per loggare errori critici delle web-app)
  readonly logger: Logger.Tagged;
}
