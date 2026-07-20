import { FiberManualRecord, Link as LinkIcon, Usb, UsbOff, Videocam } from "@mui/icons-material";
import { Button, Chip } from "@mui/material";
import { EntryRow } from "@supervisor/ui/EntryRow";
import type { ReactNode } from "react";
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

  if (camera.suitest) {
    statusChips.push(
      <Chip
        key="o"
        size="small"
        label={camera.suitest.online ? "Suitest: online" : "Suitest: offline"}
        color={camera.suitest.online ? "success" : "default"}
        title="Stato di connessione dell'app suitest-camera sul dispositivo"
      />,
    );
    if (camera.suitest.recordingActive)
      statusChips.push(
        <Chip key="r" size="small" color="error" icon={<FiberManualRecord fontSize="small" />} label="REC" />,
      );
    if (camera.suitest.streamActive) statusChips.push(<Chip key="l" size="small" color="info" label="LIVE" />);
  } else {
    statusChips.push(
      <Chip
        key="o"
        size="small"
        variant="outlined"
        icon={<LinkIcon fontSize="small" />}
        label="Link Suitest"
        onClick={onLink}
      />,
    );
  }

  statusChips.push(
    camera.adbTarget ? (
      <Chip
        key="t"
        size="small"
        variant={adbStatus === "device" ? "filled" : "outlined"}
        color={adbStatus === "device" ? "success" : "default"}
        icon={adbStatus === "device" ? <Usb fontSize="small" /> : <UsbOff fontSize="small" />}
        label={`ADB: ${camera.adbTarget}${adbStatus === "device" ? "" : ` (${adbStatus ?? "unreachable"})`}`}
        title="Stato di raggiungibilità ADB dell'host associato - clicca per riassegnare"
        onClick={onAssign}
      />
    ) : (
      <Button key="a" size="small" variant="outlined" onClick={onAssign}>
        Assign ADB Host
      </Button>
    ),
  );

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
