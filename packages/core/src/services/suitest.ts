import { pipe } from "fp-ts/function";
import * as TE from "fp-ts/TaskEither";
import * as t from "io-ts";
import { type BasicAuth, getJsonAuth, type HTTPError, postJsonBasic } from "./http";
import { fetchAllPages, type PaginationError } from "./suitest-paginate";
import { type ValidationError, validate } from "./validation";

export type SuitestError = HTTPError | ValidationError | PaginationError;

export interface SuitestConfig {
  readonly auth: BasicAuth;
  readonly baseUrl?: string;
}

const BASE_URL = "https://the.suite.st/api/public/v4";

const endpoint = (config: SuitestConfig, path: string): string => `${config.baseUrl ?? BASE_URL}${path}`;

// -------------------------------------------------------------------------------------
// Model - Device Status
// -------------------------------------------------------------------------------------

// Stati in cui il device è disponibile
const DeviceAvailableStatus = t.union([
  t.literal("CONTROLLABLE"),
  t.literal("OFF"),
  t.literal("OFFLINE"),
  t.literal("READY"),
]);

// Stati in cui il device è temporaneamente occupato
const DeviceBusyStatus = t.union([
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
const DeviceErrorStatus = t.union([
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

const DeviceStatus = t.union([DeviceAvailableStatus, DeviceBusyStatus, DeviceErrorStatus]);

export type DeviceStatus = t.TypeOf<typeof DeviceStatus>;

// -------------------------------------------------------------------------------------
// Model - Device
// -------------------------------------------------------------------------------------

const DeviceSchema = t.type({
  deviceId: t.string,
  manufacturer: t.string,
  model: t.string,
  owner: t.string,
  firmware: t.string,
  customName: t.string,
  ipAddress: t.string,
  controlUnitIds: t.array(t.string),
  status: DeviceStatus,
  modelId: t.string,
  platforms: t.array(t.string),
});

export type Device = t.TypeOf<typeof DeviceSchema>;

const DevicesResponseSchema = t.type({
  values: t.array(DeviceSchema),
});

export type DevicesResponse = t.TypeOf<typeof DevicesResponseSchema>;

// Dettaglio singolo device (stessi campi senza deviceId, viene usata per la query)
// (questo codec lo dichiariamo per mimare lo swagger ufficiale)
const DeviceDetailSchema = t.type({
  manufacturer: t.string,
  model: t.string,
  owner: t.string,
  firmware: t.string,
  customName: t.string,
  ipAddress: t.string,
  controlUnitIds: t.array(t.string),
  status: DeviceStatus,
  modelId: t.string,
  platforms: t.array(t.string),
});

export type DeviceDetail = t.TypeOf<typeof DeviceDetailSchema>;

// -------------------------------------------------------------------------------------
// Model - Control Unit (CandyBox / Raspberry Pi)
// -------------------------------------------------------------------------------------

const ControlUnitType = t.union([
  t.literal("candybox"),
  t.literal("drive"),
  t.literal("personal-pi"),
  t.literal("solo-candy"),
]);

const ControlUnitSchema = t.type({
  id: t.string,
  name: t.string,
  online: t.boolean,
  type: ControlUnitType,
});

export type ControlUnit = t.TypeOf<typeof ControlUnitSchema>;

const ControlUnitsResponseSchema = t.array(ControlUnitSchema);

// -------------------------------------------------------------------------------------
// API - Devices
// -------------------------------------------------------------------------------------

// Tutti i device
export const getAllDevices = (config: SuitestConfig): TE.TaskEither<SuitestError, readonly Device[]> =>
  fetchAllPages(endpoint(config, "/devices"), config.auth, DeviceSchema);

// Dettaglio di un singolo device
export const getDevice = (config: SuitestConfig, deviceId: string): TE.TaskEither<SuitestError, DeviceDetail> =>
  pipe(
    getJsonAuth(endpoint(config, `/devices/${encodeURIComponent(deviceId)}`), config.auth),
    TE.flatMapEither(validate(DeviceDetailSchema)),
  );

// -------------------------------------------------------------------------------------
// API - Control Units
// -------------------------------------------------------------------------------------

// Lista di tutte le control unit (CandyBox, Raspberry Pi, ecc.)
export const getControlUnits = (config: SuitestConfig): TE.TaskEither<SuitestError, readonly ControlUnit[]> =>
  pipe(
    getJsonAuth(endpoint(config, "/control-units"), config.auth),
    TE.flatMapEither(validate(ControlUnitsResponseSchema)),
  );

// Riavvia una control unit (CandyBox/Raspberry Pi)
export const rebootControlUnit = (config: SuitestConfig, controlId: string): TE.TaskEither<SuitestError, void> =>
  pipe(
    postJsonBasic(endpoint(config, `/control-units/${encodeURIComponent(controlId)}/reboot`), config.auth),
    TE.asUnit,
  );

// Spegni una control unit
export const powerOffControlUnit = (config: SuitestConfig, controlId: string): TE.TaskEither<SuitestError, void> =>
  pipe(
    postJsonBasic(endpoint(config, `/control-units/${encodeURIComponent(controlId)}/power-off`), config.auth),
    TE.asUnit,
  );

// Riavvia SuitestDrive su una control unit
export const restartSuitestDrive = (config: SuitestConfig, controlId: string): TE.TaskEither<SuitestError, void> =>
  pipe(
    postJsonBasic(endpoint(config, `/control-units/${encodeURIComponent(controlId)}/restart-sd`), config.auth),
    TE.asUnit,
  );
