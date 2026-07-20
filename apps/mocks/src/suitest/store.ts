import type { ControlUnit, Device, DeviceStatus, VideoCaptureDevice } from "@supervisor/core/services/suitest";

// -------------------------------------------------------------------------------------
// Seed data
// -------------------------------------------------------------------------------------

const device = (overrides: Partial<Device>): Device => ({
  deviceId: crypto.randomUUID(),
  customName: "",
  ipAddress: "",
  controlUnitIds: [],
  status: "READY",
  manufacturer: "Generic",
  model: "Generic Model",
  modelId: "generic-model",
  owner: "lab",
  firmware: "1.0.0",
  platforms: ["generic"],
  ...overrides,
});

const formatCuIds = (ids: number[], prefix: string, pad = 3) =>
  ids.map((id) => `${prefix}-${id.toString().padStart(pad, "0")}`);

const formatDeviceId = (index: number, prefix: string, pad = 3) => `${prefix}-${index.toString().padStart(pad, "0")}`;

const tv = (index: number, cuIds: number[]) =>
  device({
    deviceId: formatDeviceId(index, "tv"),
    customName: `TV_${index}`,
    controlUnitIds: formatCuIds(cuIds, "cu"),
    ipAddress: `192.168.2.${index}`,

    manufacturer: "Samsung",
    model: "Tizen 7.0",
    modelId: "samsung-tizen-7",
    platforms: ["tizen"],
  });

const videoCaptureDevice = (index: number, assignedTvIndex: number): VideoCaptureDevice => ({
  id: formatDeviceId(index, "vcd"),
  type: "android-app",
  name: `Pixel 6 #${index}`,
  customName: `Camera_TV_${index}`,
  assignedDeviceId: formatDeviceId(assignedTvIndex, "tv"),
  online: true,
  recordingActive: false,
  streamActive: index % 2 === 0,
  needsUpdate: false,
  batteryState: { isCharging: true, batteryLevel: 87, batteryTemperature: 29 },
});

const controlUnit = (index: number): ControlUnit => ({
  id: formatDeviceId(index, "cu"),
  name: `CandyBox_${index}`,
  online: true,
  type: "candybox",
});

const seedDevices: Device[] = [
  // CU 1
  tv(1, [1]),
  tv(2, [1]),

  // CU 2
  tv(3, [2]),
  tv(4, [2]),
];

const seedVideoCaptureDevices: VideoCaptureDevice[] = [
  videoCaptureDevice(1, 1),
  videoCaptureDevice(2, 2),
  videoCaptureDevice(3, 3),
  videoCaptureDevice(4, 4),
];

const seedControlUnits: ControlUnit[] = [controlUnit(1), controlUnit(2)];

// -------------------------------------------------------------------------------------
// Store
// -------------------------------------------------------------------------------------

export class SuitestStore {
  devices: Device[];
  videoCaptureDevices: VideoCaptureDevice[];
  controlUnits: ControlUnit[];

  constructor() {
    this.devices = structuredClone(seedDevices);
    this.videoCaptureDevices = structuredClone(seedVideoCaptureDevices);
    this.controlUnits = structuredClone(seedControlUnits);
  }

  reset = () => {
    this.devices = structuredClone(seedDevices);
    this.videoCaptureDevices = structuredClone(seedVideoCaptureDevices);
    this.controlUnits = structuredClone(seedControlUnits);
  };

  getDevice = (id: string): Device | undefined => this.devices.find((d) => d.deviceId === id);

  setDeviceStatus = (id: string, status: DeviceStatus): boolean => {
    const device = this.getDevice(id);
    if (!device) return false;
    (device as { status: DeviceStatus }).status = status;
    return true;
  };

  getControlUnit = (id: string): ControlUnit | undefined => this.controlUnits.find((cu) => cu.id === id);
}
