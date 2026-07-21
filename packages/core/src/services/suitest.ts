import { constVoid, pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import { format } from "../errors";
import { type BasicAuth, getJsonAuth, type HTTPError, postJsonBasic } from "../http";
import * as Logger from "../logger";
import { type ValidationError, validate } from "../validation";
import { fetchAllPages, type PaginationFetchError } from "./suitest-paginate";

export type SuitestError = HTTPError | ValidationError | PaginationFetchError;

export interface SuitestConfig {
  readonly auth: BasicAuth;
  readonly baseUrl?: string;
  readonly logger?: Logger.Tagged;
}

const BASE_URL = "https://the.suite.st/api/public/v4";

const endpoint = (config: SuitestConfig, path: string): string => `${config.baseUrl ?? BASE_URL}${path}`;

// -------------------------------------------------------------------------------------
// Model - Device Status
// -------------------------------------------------------------------------------------

// Stati in cui il device è disponibile
const DeviceAvailableStatusCodec = t.union([
  t.literal("CONTROLLABLE"),
  t.literal("OFF"),
  t.literal("OFFLINE"),
  t.literal("READY"),
]);

// Stati in cui il device è temporaneamente occupato
const DeviceBusyStatusCodec = t.union([
  t.literal("API_CONTROLLED"),
  t.literal("CANDYBOX_UPDATE"),
  t.literal("CLEANUP"),
  t.literal("INTERACTIVE_MODE"),
  t.literal("MAINTENANCE"),
  t.literal("MANUAL_RUN"),
  t.literal("POWER_ON"),
  t.literal("RESTARTING"),
  t.literal("SHUTDOWN"),
  t.literal("SUITEST_DRIVE_UPDATE"),
  t.literal("TESTING"),
]);

// Stati che richiedono intervento manuale
const DeviceErrorStatusCodec = t.union([
  t.literal("BLASTER_ERROR"),
  t.literal("CANDYBOX_OFFLINE"),
  t.literal("CANNOT_TURN_ON"),
  t.literal("DISABLED"),
  t.literal("DRIVER_FAILURE"),
  t.literal("DRIVER_INIT_FAILURE"),
  t.literal("INTERNAL_FAILURE"),
  t.literal("NOT_CONFIGURED"),
  t.literal("SUITESTDRIVE_OFFLINE"),
  t.literal("SUITESTDRIVE_SERVICE_OFFLINE"),
]);

export const DeviceStatusCodec = t.union([DeviceAvailableStatusCodec, DeviceBusyStatusCodec, DeviceErrorStatusCodec]);

export type DeviceStatus = t.TypeOf<typeof DeviceStatusCodec>;

// Chi sta attualmente usando il device (o la TV) - presente solo se in uso
export const InUseByCodec = t.partial({
  email: t.string,
  orgName: t.string,
  tokenName: t.string,
});

export type InUseBy = t.TypeOf<typeof InUseByCodec>;

// Campi liberi configurabili dal proprietario del device (pass-through, mai interpretati da noi)
export const CustomUserInfoCodec = t.partial({
  location: t.string,
  team: t.string,
  responsibleUser: t.string,
  osInfo: t.string,
  otherInfo: t.string,
});

export type CustomUserInfo = t.TypeOf<typeof CustomUserInfoCodec>;

// -------------------------------------------------------------------------------------
// Model - Device (TV, smart plug, ...)
// -------------------------------------------------------------------------------------

const DeviceRequiredCodec = t.type({
  deviceId: t.string,
  manufacturer: t.string,
  model: t.string,
  owner: t.string,
  firmware: t.string,
  customName: t.string,
  ipAddress: t.string,
  controlUnitIds: t.array(t.string),
  status: DeviceStatusCodec,
  modelId: t.string,
  platforms: t.array(t.string),
});

const DeviceOptionalCodec = t.partial({
  osVersion: t.string,
  inactivityTimeout: t.number,
  customUserInfo: CustomUserInfoCodec,
  inUseBy: InUseByCodec,
});

export const DeviceCodec = t.intersection([DeviceRequiredCodec, DeviceOptionalCodec]);

export type Device = t.TypeOf<typeof DeviceCodec>;

// Dettaglio singolo device (stessi campi senza deviceId, viene usata per la query)
// (questo codec lo dichiariamo per mimare lo swagger ufficiale)
const DeviceDetailRequiredCodec = t.type({
  manufacturer: t.string,
  model: t.string,
  owner: t.string,
  firmware: t.string,
  customName: t.string,
  ipAddress: t.string,
  controlUnitIds: t.array(t.string),
  status: DeviceStatusCodec,
  modelId: t.string,
  platforms: t.array(t.string),
});

export const DeviceDetailCodec = t.intersection([DeviceDetailRequiredCodec, DeviceOptionalCodec]);

export type DeviceDetail = t.TypeOf<typeof DeviceDetailCodec>;

// -------------------------------------------------------------------------------------
// Model - Control Unit (CandyBox / Raspberry Pi / SuitestDrive)
// -------------------------------------------------------------------------------------

const ControlUnitTypeCodec = t.union([
  t.literal("candybox"),
  t.literal("drive"),
  t.literal("personal-pi"),
  t.literal("solo-candy"),
]);

const ControlUnitRequiredCodec = t.type({
  id: t.string,
  name: t.string,
  online: t.boolean,
  type: ControlUnitTypeCodec,
});

// Definiti solo per Raspberry Pi/CandyBox/WingBox (reboot/shutdown) o solo da SuitestDrive (osName/osVersion)
const ControlUnitOptionalCodec = t.partial({
  reboot: t.boolean,
  shutdown: t.boolean,
  ip: t.string,
  osName: t.string,
  osVersion: t.string,
});

export const ControlUnitCodec = t.intersection([ControlUnitRequiredCodec, ControlUnitOptionalCodec]);

export type ControlUnit = t.TypeOf<typeof ControlUnitCodec>;

const ControlUnitsResponseCodec = t.array(ControlUnitCodec);

// -------------------------------------------------------------------------------------
// Model - Video Capture Device (Android app / USB camera che cattura lo schermo di un device)
// -------------------------------------------------------------------------------------

const VideoCaptureDeviceTypeCodec = t.union([t.literal("android-app"), t.literal("usb-camera")]);

export const BatteryStateCodec = t.partial({
  isCharging: t.boolean,
  batteryLevel: t.number,
  batteryTemperature: t.number,
});

export type BatteryState = t.TypeOf<typeof BatteryStateCodec>;

const VideoCaptureDeviceRequiredCodec = t.type({
  id: t.string,
  type: VideoCaptureDeviceTypeCodec,
  name: t.string,
  assignedDeviceId: t.string,
  online: t.boolean,
  recordingActive: t.boolean,
  streamActive: t.boolean,
});

// customName/needsUpdate/batteryState non sono garantiti dallo swagger ufficiale (es. batteryState
// esiste solo per app android online)
const VideoCaptureDeviceOptionalCodec = t.partial({
  customName: t.string,
  needsUpdate: t.boolean,
  batteryState: BatteryStateCodec,
});

export const VideoCaptureDeviceCodec = t.intersection([
  VideoCaptureDeviceRequiredCodec,
  VideoCaptureDeviceOptionalCodec,
]);

export type VideoCaptureDevice = t.TypeOf<typeof VideoCaptureDeviceCodec>;

// -------------------------------------------------------------------------------------
// Logging helper
// -------------------------------------------------------------------------------------

const loggedGet = (config: SuitestConfig, path: string): TE.TaskEither<HTTPError, unknown> => {
  const url = endpoint(config, path);
  return pipe(
    config.logger ? TE.fromIO(config.logger.debug(`GET ${url}`)) : TE.right(undefined),
    TE.flatMap(() => getJsonAuth(url, config.auth)),
    TE.tapIO((data) =>
      config.logger //
        ? config.logger.child("HTTP").debug(`${Logger.formatJsonLog([{ response: data }])}`)
        : constVoid,
    ),
    TE.tapError((err) => (config.logger ? TE.fromIO(config.logger.error(`  X ${format(err)}`)) : TE.right(undefined))),
  );
};

const loggedPost = (config: SuitestConfig, path: string): TE.TaskEither<HTTPError, unknown> => {
  const url = endpoint(config, path);
  return pipe(
    config.logger ? TE.fromIO(config.logger.debug(`POST ${url}`)) : TE.right(undefined),
    TE.flatMap(() => postJsonBasic(url, config.auth)),
    TE.tapError((err) => (config.logger ? TE.fromIO(config.logger.error(`  X ${format(err)}`)) : TE.right(undefined))),
  );
};

// -------------------------------------------------------------------------------------
// API - Devices
// -------------------------------------------------------------------------------------

// TVs, Smart Plugs (mai fotocamere: quelle arrivano solo da /video-capture-devices)
export const getAllDevices = (config: SuitestConfig): TE.TaskEither<SuitestError, readonly Device[]> =>
  pipe(
    fetchAllPages(endpoint(config, "/devices"), config.auth, DeviceCodec, config.logger),
    TE.tapIO((devices) => (config.logger ? config.logger.debug(`  -> ${devices.length} devices total`) : () => {})),
    TE.tapError((err) => (config.logger ? TE.fromIO(config.logger.error(`  X ${format(err)}`)) : TE.right(undefined))),
  );

// Dettaglio di un singolo device
export const getDevice = (config: SuitestConfig, deviceId: string): TE.TaskEither<SuitestError, DeviceDetail> =>
  pipe(loggedGet(config, `/devices/${encodeURIComponent(deviceId)}`), TE.flatMapEither(validate(DeviceDetailCodec)));

// -------------------------------------------------------------------------------------
// API - Control Units
// -------------------------------------------------------------------------------------

// Lista di tutte le control unit (CandyBox, Raspberry Pi, ecc.)
export const getControlUnits = (config: SuitestConfig): TE.TaskEither<SuitestError, readonly ControlUnit[]> =>
  pipe(loggedGet(config, "/control-units"), TE.flatMapEither(validate(ControlUnitsResponseCodec)));

// -------------------------------------------------------------------------------------
// API - Video Capture Devices
// -------------------------------------------------------------------------------------

export const getVideoCaptureDevices = (
  config: SuitestConfig,
): TE.TaskEither<SuitestError, readonly VideoCaptureDevice[]> =>
  pipe(
    fetchAllPages(endpoint(config, "/video-capture-devices"), config.auth, VideoCaptureDeviceCodec, config.logger),
    TE.tapIO((devices) =>
      config.logger ? config.logger.debug(`  -> ${devices.length} video capture devices total`) : () => {},
    ),
    TE.tapError((err) => (config.logger ? TE.fromIO(config.logger.error(`  X ${format(err)}`)) : TE.right(undefined))),
  );

// Riavvia una control unit (CandyBox/Raspberry Pi)
export const rebootControlUnit = (config: SuitestConfig, controlId: string): TE.TaskEither<SuitestError, void> =>
  pipe(loggedPost(config, `/control-units/${encodeURIComponent(controlId)}/reboot`), TE.asUnit);
