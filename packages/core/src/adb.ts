import * as O from "fp-ts/Option";
import { match, P } from "ts-pattern";

export type DeviceState =
  | "device"
  | "recovery"
  | "rescue"
  | "sideload"
  | "bootloader"
  | "disconnect"
  | "offline"
  | "unknown";

export const matchDeviceState = (raw: string): O.Option<DeviceState> =>
  match(raw)
    .with(
      P.union("device", "recovery", "rescue", "sideload", "bootloader", "disconnect", "offline"),
      (s): O.Option<DeviceState> => O.some(s),
    )
    .otherwise(() => O.none);

export interface AdbError {
  readonly type: "AdbError";
  readonly message: string;
}
