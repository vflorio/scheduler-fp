import type { AdbDevice } from "../../hooks/useAdbDevices";

// -------------------------------------------------------------------------------------
// Types (mirrored dal core - due domini nettamente separati, come nel db)
//
// `lab` è il dominio applicativo (label/controlled/ip), preconfigurabile e indipendente da
// Suitest: ogni entry ha al più un `suitestId` opzionale come foreign key. `suitest` è il mirror
// in sola lettura dei dati grezzi Suitest, indicizzato per id. Qui uniamo i due lato client per
// costruire la vista (nessuna delle due entità è "composta" lato db).
// -------------------------------------------------------------------------------------

export type DeviceKind = "control-unit" | "camera" | "tv";

export interface InUseBy {
  email?: string;
  orgName?: string;
  tokenName?: string;
}

// --- lab (dominio applicativo) ---

export interface ControlUnitEntry {
  id: string;
  label: string;
  controlled: boolean;
}

export interface CameraEntry {
  id: string;
  label: string;
  controlled: boolean;
  adbTarget?: string;
  suitestId?: string;
}

export interface TvEntry {
  ip: string;
  label: string;
  controlled: boolean;
  suitestId?: string;
}

// --- suitest (mirror in sola lettura) ---

export interface SuitestControlUnit {
  id: string;
  name: string;
  online: boolean;
}

export interface SuitestDevice {
  deviceId: string;
  customName: string;
  ipAddress: string;
  controlUnitIds: string[];
  inUseBy?: InUseBy;
}

export interface SuitestVideoCaptureDevice {
  id: string;
  name: string;
  customName?: string;
  assignedDeviceId: string;
  online: boolean;
  recordingActive: boolean;
  streamActive: boolean;
}

export interface Db {
  suitest: {
    devices: Record<string, SuitestDevice>;
    controlUnits: Record<string, SuitestControlUnit>;
    videoCaptureDevices: Record<string, SuitestVideoCaptureDevice>;
  };
  lab: {
    controlUnits: Record<string, ControlUnitEntry>;
    cameras: Record<string, CameraEntry>;
    tvs: Record<string, TvEntry>;
  };
}

// --- view model (lab + eventuale join con suitest, per il rendering) ---

export interface ControlUnitView extends ControlUnitEntry {
  online?: boolean;
}

export interface CameraView extends CameraEntry {
  suitest?: {
    customName?: string;
    assignedDeviceId?: string;
    online: boolean;
    recordingActive: boolean;
    streamActive: boolean;
  };
}

export interface TvView extends TvEntry {
  controlUnitIds?: string[];
  inUseBy?: InUseBy;
}

export interface TvGroup {
  tv: TvView;
  cameras: CameraView[];
}

export interface CuGroup {
  cu: ControlUnitView;
  tvs: TvGroup[];
}

export interface Hierarchy {
  cuGroups: CuGroup[];
  unallocatedTvs: TvGroup[];
  orphanCameras: CameraView[];
}

export interface NewDeviceForm {
  kind: DeviceKind;
  label: string;
  identifier: string;
  controlled: boolean;
}

export interface LinkingTarget {
  kind: "tv" | "camera";
  id: string; // ip per tv, id per camera
  currentSuitestId?: string;
}

// Props condivise dalle righe della gerarchia (control unit / tv / camera)
export interface RowActions {
  adbDevices: readonly AdbDevice[];
  onToggle: (kind: DeviceKind, id: string, controlled: boolean) => void;
  onEdit: (kind: DeviceKind, id: string, label: string) => void;
  onDelete: (kind: DeviceKind, id: string) => void;
  onAssignCamera: (camera: CameraView) => void;
  onLinkTv: (tv: TvView) => void;
  onLinkCamera: (camera: CameraView) => void;
}
