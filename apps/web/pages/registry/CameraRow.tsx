import { Link as LinkIcon, Videocam } from "@mui/icons-material";
import { Chip } from "@mui/material";
import * as NetworkTarget from "@supervisor/core/network-target";
import { EntryRow } from "@supervisor/ui/EntryRow";
import * as O from "fp-ts/Option";
import type { ReactNode } from "react";
import { PredicateDot } from "../../components/PredicateDot";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import type { CameraView, DeviceKind } from "./types";

export function CameraRow({
  camera,
  adbStatus,
  onToggle,
  onEdit,
  onDelete,
  onAssign,
  onLink,
}: {
  camera: CameraView;
  adbStatus: AdbDevice["status"] | null;
  onToggle: (kind: DeviceKind, id: string, controlled: boolean) => void;
  onEdit: (kind: DeviceKind, id: string, label: string) => void;
  onDelete: (kind: DeviceKind, id: string) => void;
  onAssign: () => void;
  onLink: () => void;
}) {
  const statusChips: ReactNode[] = [];
  const videoCaptureDeviceId = O.toUndefined(camera.videoCaptureDeviceId);

  if (!camera.adb) {
    statusChips.push(
      <Chip
        key="a"
        size="small"
        variant="outlined"
        icon={<LinkIcon fontSize="small" />}
        label="Assign ADB"
        onClick={onAssign}
        sx={{ mr: 4 }}
      />,
    );
  }

  if (!camera.suitest || !videoCaptureDeviceId) {
    statusChips.push(
      <Chip
        key="o"
        size="small"
        variant="outlined"
        icon={<LinkIcon fontSize="small" />}
        label="Link Suitest"
        onClick={onLink}
        sx={{ mr: 4 }}
      />,
    );
  } else {
    statusChips.push(
      <PredicateDot
        key="pr"
        domain="suitest-camera"
        entityId={videoCaptureDeviceId}
        name="suitest_camera_recording"
        label="Recording"
        colorFor={(value) => (value === undefined ? "disabled" : value ? "error" : "disabled")}
        detail={(value) => (value ? "recording" : "idle")}
      />,
      <PredicateDot
        key="pl"
        domain="suitest-camera"
        entityId={videoCaptureDeviceId}
        name="suitest_camera_streaming"
        label="Streaming"
        colorFor={(value) => (value === undefined ? "disabled" : value ? "info" : "disabled")}
        detail={(value) => (value ? "streaming" : "not streaming")}
      />,
      <PredicateDot
        key="pc"
        domain="suitest-camera"
        entityId={videoCaptureDeviceId}
        name="suitest_camera_connected"
        label="Camera connected"
        colorFor={(value) => (value === undefined ? "disabled" : value ? "success" : "error")}
        detail={(value) => (value === undefined ? "unknown" : value ? "online" : "offline")}
      />,
    );
  }

  if (camera.adb) {
    const address = NetworkTarget.format(camera.adb.target);
    statusChips.push(
      <Chip
        key="ra"
        size="small"
        variant="outlined"
        icon={<LinkIcon fontSize="small" />}
        label="Reassign ADB"
        onClick={onAssign}
        sx={{ mr: 4 }}
      />,
      <PredicateDot
        key="pa"
        domain="adb"
        entityId={address}
        name="adb_device_reachable"
        label="ADB reachable"
        colorFor={(value) => (value === undefined ? "disabled" : value ? "success" : "error")}
        detail={(value) =>
          `${address}, ${value === undefined ? "unknown" : value ? "reachable" : (adbStatus ?? "unreachable")}`
        }
      />,
    );
  }

  return (
    <EntryRow
      icon={<Videocam fontSize="small" />}
      label={camera.label}
      secondary={
        camera.suitest?.customName && camera.suitest.customName !== camera.label ? camera.suitest.customName : undefined
      }
      checked={camera.controlled}
      checkedTitle="Controlled by supervisor"
      statusChips={statusChips}
      onToggle={() => onToggle("camera", camera.id, camera.controlled)}
      onEdit={() => onEdit("camera", camera.id, camera.label)}
      onDelete={() => onDelete("camera", camera.id)}
    />
  );
}
