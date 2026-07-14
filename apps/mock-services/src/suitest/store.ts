import type { ControlUnit, Device, DeviceStatus } from "@supervisor/core/suitest";

// -------------------------------------------------------------------------------------
// Seed data
// -------------------------------------------------------------------------------------

const seedDevices: Device[] = [
  {
    deviceId: "dev-001",
    manufacturer: "Samsung",
    model: "Tizen 7.0",
    owner: "team-qa",
    firmware: "7.0.0.1234",
    customName: "Samsung Living Room",
    ipAddress: "192.168.1.10",
    controlUnitIds: ["cu-001"],
    status: "READY",
    modelId: "samsung-tizen-7",
    platforms: ["tizen"],
  },
  {
    deviceId: "dev-002",
    manufacturer: "LG",
    model: "webOS 23",
    owner: "team-qa",
    firmware: "23.10.5",
    customName: "LG Kitchen",
    ipAddress: "192.168.1.11",
    controlUnitIds: ["cu-001"],
    status: "READY",
    modelId: "lg-webos-23",
    platforms: ["webos"],
  },
  {
    deviceId: "dev-003",
    manufacturer: "Amazon",
    model: "Fire TV Stick 4K",
    owner: "team-qa",
    firmware: "6.2.9.4",
    customName: "FireTV Lab",
    ipAddress: "192.168.1.12",
    controlUnitIds: ["cu-002"],
    status: "OFF",
    modelId: "amazon-firetv-4k",
    platforms: ["android"],
  },
  {
    deviceId: "dev-004",
    manufacturer: "Google",
    model: "Chromecast with Google TV",
    owner: "team-dev",
    firmware: "12.1",
    customName: "Chromecast Meeting Room",
    ipAddress: "192.168.1.13",
    controlUnitIds: ["cu-002"],
    status: "TESTING",
    modelId: "google-chromecast-gtv",
    platforms: ["android"],
  },
  {
    deviceId: "dev-005",
    manufacturer: "Sony",
    model: "Bravia XR",
    owner: "team-dev",
    firmware: "11.0.A.0.1",
    customName: "Sony Showroom",
    ipAddress: "192.168.1.14",
    controlUnitIds: ["cu-001"],
    status: "CANDYBOX_OFFLINE",
    modelId: "sony-bravia-xr",
    platforms: ["android"],
  },
];

const seedControlUnits: ControlUnit[] = [
  { id: "cu-001", name: "CandyBox Alpha", online: true, type: "candybox" },
  { id: "cu-002", name: "CandyBox Beta", online: true, type: "candybox" },
  { id: "cu-003", name: "Pi Dev", online: false, type: "personal-pi" },
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
