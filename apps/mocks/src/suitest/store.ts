import type { ControlUnit, Device, DeviceStatus } from "@supervisor/core/services/suitest";

// -------------------------------------------------------------------------------------
// Seed data
// -------------------------------------------------------------------------------------

// 4 Android Cameras (192.168.1.11 - 192.168.1.14)
// 2 per control unit, each CU also owns 1 Smart TV
const seedDevices: Device[] = [
  // Cameras owned by CU Alpha
  {
    deviceId: "cam-001",
    manufacturer: "Google",
    model: "Pixel 6",
    owner: "team-qa",
    firmware: "14.0",
    customName: "Camera Alpha-1",
    ipAddress: "192.168.1.11",
    controlUnitIds: ["cu-001"],
    status: "READY",
    modelId: "google-pixel-6",
    platforms: ["android"],
  },
  {
    deviceId: "cam-002",
    manufacturer: "Google",
    model: "Pixel 7",
    owner: "team-qa",
    firmware: "14.0",
    customName: "Camera Alpha-2",
    ipAddress: "192.168.1.12",
    controlUnitIds: ["cu-001"],
    status: "READY",
    modelId: "google-pixel-7",
    platforms: ["android"],
  },
  // Cameras owned by CU Beta
  {
    deviceId: "cam-003",
    manufacturer: "Samsung",
    model: "Galaxy A54",
    owner: "team-qa",
    firmware: "14.0",
    customName: "Camera Beta-1",
    ipAddress: "192.168.1.13",
    controlUnitIds: ["cu-002"],
    status: "READY",
    modelId: "samsung-a54",
    platforms: ["android"],
  },
  {
    deviceId: "cam-004",
    manufacturer: "Samsung",
    model: "Galaxy A55",
    owner: "team-qa",
    firmware: "14.0",
    customName: "Camera Beta-2",
    ipAddress: "192.168.1.14",
    controlUnitIds: ["cu-002"],
    status: "OFF",
    modelId: "samsung-a55",
    platforms: ["android"],
  },
  // Smart TVs (1 per control unit)
  {
    deviceId: "tv-001",
    manufacturer: "Samsung",
    model: "Tizen 7.0",
    owner: "team-qa",
    firmware: "7.0.0.1234",
    customName: "TV Alpha",
    ipAddress: "192.168.1.110",
    controlUnitIds: ["cu-001"],
    status: "READY",
    modelId: "samsung-tizen-7",
    platforms: ["tizen"],
  },
  {
    deviceId: "tv-002",
    manufacturer: "LG",
    model: "webOS 23",
    owner: "team-qa",
    firmware: "23.10.5",
    customName: "TV Beta",
    ipAddress: "192.168.1.111",
    controlUnitIds: ["cu-002"],
    status: "READY",
    modelId: "lg-webos-23",
    platforms: ["webos"],
  },
];

const seedControlUnits: ControlUnit[] = [
  { id: "cu-001", name: "CandyBox Alpha", online: true, type: "candybox" },
  { id: "cu-002", name: "CandyBox Beta", online: true, type: "candybox" },
];

// -------------------------------------------------------------------------------------
// Store
// -------------------------------------------------------------------------------------

export class SuitestStore {
  devices: Device[];
  controlUnits: ControlUnit[];

  constructor() {
    this.devices = structuredClone(seedDevices);
    this.controlUnits = structuredClone(seedControlUnits);
  }

  reset = () => {
    this.devices = structuredClone(seedDevices);
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
