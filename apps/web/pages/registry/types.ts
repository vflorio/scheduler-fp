import type { CameraEntry, CandyboxEntry, Db, TvEntry } from "@supervisor/core/services/db";
import type { InUseBy } from "@supervisor/core/services/suitest";
import type { AdbDevice } from "../../hooks/useAdbDevices";

export type { Db };

export type DeviceKind = "candybox" | "camera" | "tv";

export interface ControlUnitView extends CandyboxEntry {
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
