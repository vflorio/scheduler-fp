import { Chip } from "@mui/material";
import { SelectDialog } from "@supervisor/ui/SelectDialog";
import type { AdbDevice } from "../../hooks/useAdbDevices";
import type { CameraView } from "./types";

export function AssignCameraDialog({
  camera,
  adbDevices,
  usedTargets,
  onAssign,
  onClose,
}: {
  camera: CameraView | null;
  adbDevices: readonly AdbDevice[];
  usedTargets: ReadonlySet<string>;
  onAssign: (target: string) => void;
  onClose: () => void;
}) {
  const candidates = adbDevices.filter((d) => d.target === camera?.adbTarget || !usedTargets.has(d.target));

  return (
    <SelectDialog
      open={camera !== null}
      title={`Assegna host ADB${camera ? ` - ${camera.label}` : ""}`}
      selectedId={camera?.adbTarget}
      options={candidates.map((d) => ({
        id: d.target,
        primary: <span style={{ fontFamily: "monospace" }}>{d.target}</span>,
        trailing: <Chip size="small" label={d.status} color={d.status === "device" ? "success" : "default"} />,
      }))}
      emptyMessage={
        <>
          Nessun device ADB disponibile al momento.
          <br />
          Verifica che il device sia connesso in rete e rilevato dal servizio.
        </>
      }
      onSelect={onAssign}
      onClose={onClose}
    />
  );
}
