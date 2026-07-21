import type * as TE from "fp-ts/TaskEither";
import type { LogFeed } from "../log-stream";
import type * as Logger from "../logger";
import type * as NetworkTarget from "../network-target";
import type { AdbError } from "./adb";
import type * as Db from "./db";

export interface AndroidBridgeError {
  readonly type: "AndroidBridgeError";
  readonly message: string;
}

export interface AndroidBridge {
  readonly devices: () => TE.TaskEither<AdbError, readonly { target: string; status: string }[]>;
  readonly reboot: (target: NetworkTarget.Target) => TE.TaskEither<AdbError, void>;
}

// biome-ignore lint/suspicious/noEmptyInterface: <wip>
export interface MdnsDiscovery {}

// biome-ignore lint/suspicious/noEmptyInterface: <wip>
export interface Notifications {}

export interface DeviceRegistry {
  readonly getAll: () => TE.TaskEither<Db.DbError, Db.Db>;

  readonly candyboxes: {
    readonly update: (input: Db.CandyboxUpdateInput) => TE.TaskEither<Db.DbError, Db.Db>;
    readonly add: (entry: Db.CandyboxEntry) => TE.TaskEither<Db.DbError, Db.Db>;
    readonly remove: (id: string) => TE.TaskEither<Db.DbError, Db.Db>;
  };

  readonly cameras: {
    readonly update: (input: Db.CameraUpdateInput) => TE.TaskEither<Db.DbError, Db.Db>;
    readonly add: (entry: Db.CameraEntry) => TE.TaskEither<Db.DbError, Db.Db>;
    readonly remove: (id: string) => TE.TaskEither<Db.DbError, Db.Db>;
  };

  readonly tvs: {
    readonly update: (input: Db.TvUpdateInput) => TE.TaskEither<Db.DbError, Db.Db>;
    readonly add: (entry: Db.TvEntry) => TE.TaskEither<Db.DbError, Db.Db>;
    readonly remove: (deviceId: string) => TE.TaskEither<Db.DbError, Db.Db>;
  };

  readonly adb: {
    readonly update: (input: Db.AdbUpdateInput) => TE.TaskEither<Db.DbError, Db.Db>;
    readonly add: (entry: Db.AdbEntry) => TE.TaskEither<Db.DbError, Db.Db>;
    readonly remove: (id: string) => TE.TaskEither<Db.DbError, Db.Db>;
  };
}

export interface Services {
  readonly android: AndroidBridge;
  readonly mdns: MdnsDiscovery;
  readonly registry: DeviceRegistry;
  readonly notifications: Notifications;
  // Questo serve per permettere di avere in logger transportato in HTTP (per loggare errori critici delle web-app)
  readonly logger: Logger.Tagged; // Web -> Service
  // Feed live dei log di servizio (formattati come su console) per la subscription tRPC verso la web-app
  readonly logs: LogFeed; // Service -> Web
}
