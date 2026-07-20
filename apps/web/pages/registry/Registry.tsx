import { Add } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Paper,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { type AdbDevice, useAdbDevices } from "../../hooks/useAdbDevices";
import type { Data } from "./+data";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { AssignCameraDialog } from "./AssignCameraDialog";
import { CameraRow } from "./CameraRow";
import { ControlUnitCard } from "./ControlUnitCard";
import { adbStatusFor, buildHierarchy, cameraSuitestCandidates, tvSuitestCandidates } from "./hierarchy";
import { LinkSuitestDialog } from "./LinkSuitestDialog";
import { mutate, mutations } from "./mutations";
import { TvRow } from "./TvRow";
import type { CameraView, Db, DeviceKind, LinkingTarget, NewDeviceForm, TvView } from "./types";

// -------------------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------------------

export function RegistryView() {
  const { registry, adbDevices } = useData<Data>();
  const liveAdbDevices = useAdbDevices(adbDevices.ok ? adbDevices.data : []);

  return match(registry)

    .with({ ok: true }, ({ data }) => <HierarchyView db={data} adbDevices={liveAdbDevices} />)
    .with({ ok: false }, ({ error }) => <Alert severity="error">Registry error: {error.message}</Alert>)
    .exhaustive();
}

const emptyNewDevice: NewDeviceForm = { kind: "camera", label: "", identifier: "", controlled: true };

const identifierLabel = (kind: DeviceKind) => (kind === "control-unit" ? "Control Unit ID" : "IP Address");

function HierarchyView({ db, adbDevices }: { db: Db; adbDevices: readonly AdbDevice[] }) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: DeviceKind; id: string; label: string } | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newDevice, setNewDevice] = useState<NewDeviceForm>(emptyNewDevice);
  const [assigningCamera, setAssigningCamera] = useState<CameraView | null>(null);
  const [linking, setLinking] = useState<LinkingTarget | null>(null);

  const handleToggle = (kind: DeviceKind, id: string, controlled: boolean) =>
    mutate(
      () =>
        match(kind)
          .with("control-unit", () => mutations["control-unit"].update.mutate({ id, controlled: !controlled }))
          .with("camera", () => mutations.camera.update.mutate({ id, controlled: !controlled }))
          .with("tv", () => mutations.tv.update.mutate({ ip: id, controlled: !controlled }))
          .exhaustive(),
      setError,
    );

  const handleSaveLabel = () =>
    mutate(async () => {
      if (!editing) return { ok: false as const, error: { type: "ValidationError", message: "Nothing to edit" } };

      const result = await match(editing.kind)
        .with("control-unit", () => mutations["control-unit"].update.mutate({ id: editing.id, label: editLabel }))
        .with("camera", () => mutations.camera.update.mutate({ id: editing.id, label: editLabel }))
        .with("tv", () => mutations.tv.update.mutate({ ip: editing.id, label: editLabel }))
        .exhaustive();
      if (result.ok) setEditing(null);
      return result;
    }, setError);

  const handleDelete = (kind: DeviceKind, id: string) =>
    mutate(
      () =>
        match(kind)
          .with("control-unit", () => mutations["control-unit"].remove.mutate(id))
          .with("camera", () => mutations.camera.remove.mutate(id))
          .with("tv", () => mutations.tv.remove.mutate(id))
          .exhaustive(),
      setError,
    );

  const handleAssign = (target: string) =>
    mutate(async () => {
      if (!assigningCamera) return { ok: false as const, error: { type: "ValidationError", message: "No camera" } };

      const result = await mutations.camera.update.mutate({
        id: assigningCamera.id,
        adbTarget: target as `${string}:${number}`,
      });
      if (result.ok) setAssigningCamera(null);
      return result;
    }, setError);

  const handleLinkSuitest = (suitestId: string) =>
    mutate(async () => {
      if (!linking) return { ok: false as const, error: { type: "ValidationError", message: "Nothing to link" } };

      const result = await match(linking.kind)
        .with("tv", () => mutations.tv.update.mutate({ ip: linking.id, suitestId }))
        .with("camera", () => mutations.camera.update.mutate({ id: linking.id, suitestId }))
        .exhaustive();
      if (result.ok) setLinking(null);
      return result;
    }, setError);

  const handleAdd = () =>
    mutate(async () => {
      if (!newDevice.label || (newDevice.kind !== "camera" && !newDevice.identifier))
        return {
          ok: false as const,
          error: { type: "ValidationError", message: `Label and ${identifierLabel(newDevice.kind)} required` },
        };

      const result = await match(newDevice.kind)
        .with("control-unit", () =>
          mutations["control-unit"].add.mutate({
            id: newDevice.identifier,
            label: newDevice.label,
            controlled: newDevice.controlled,
          }),
        )
        .with("camera", () =>
          mutations.camera.add.mutate({
            id: crypto.randomUUID(),
            label: newDevice.label,
            controlled: newDevice.controlled,
          }),
        )
        .with("tv", () =>
          mutations.tv.add.mutate({
            ip: newDevice.identifier,
            label: newDevice.label,
            controlled: newDevice.controlled,
          }),
        )
        .exhaustive();

      if (result.ok) {
        setAddOpen(false);
        setNewDevice(emptyNewDevice);
      }
      return result;
    }, setError);

  const startEdit = (kind: DeviceKind, id: string, label: string) => {
    setEditing({ kind, id, label });
    setEditLabel(label);
  };

  const handleLinkTv = (tv: TvView) => setLinking({ kind: "tv", id: tv.ip, currentSuitestId: tv.suitestId });
  const handleLinkCamera = (camera: CameraView) =>
    setLinking({ kind: "camera", id: camera.id, currentSuitestId: camera.suitestId });

  const { cuGroups, unallocatedTvs, orphanCameras } = buildHierarchy(db);

  const totalDevices =
    Object.keys(db.lab.controlUnits).length + Object.keys(db.lab.cameras).length + Object.keys(db.lab.tvs).length;

  const totalControlled =
    Object.values(db.lab.controlUnits).filter((d) => d.controlled).length +
    Object.values(db.lab.cameras).filter((d) => d.controlled).length +
    Object.values(db.lab.tvs).filter((d) => d.controlled).length;

  const usedAdbTargets = new Set(
    Object.values(db.lab.cameras)
      .map((c) => c.adbTarget)
      .filter((t): t is string => t !== undefined),
  );

  const linkCandidates =
    linking?.kind === "tv"
      ? tvSuitestCandidates(db, linking.currentSuitestId)
      : linking?.kind === "camera"
        ? cameraSuitestCandidates(db, linking.currentSuitestId)
        : [];

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 3, gap: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1, fontWeight: 600 }}>
          Device Registry
        </Typography>
        <Chip label={`${totalDevices} devices`} size="small" />
        <Chip label={`${totalControlled} controlled`} size="small" color="primary" />
        <IconButton onClick={() => setAddOpen(true)} color="primary" title="Add device">
          <Add />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <Stack spacing={2}>
        {cuGroups.map((group) => (
          <ControlUnitCard
            key={group.cu.id}
            group={group}
            adbDevices={adbDevices}
            onToggle={handleToggle}
            onEdit={startEdit}
            onDelete={handleDelete}
            onAssignCamera={setAssigningCamera}
            onLinkTv={handleLinkTv}
            onLinkCamera={handleLinkCamera}
          />
        ))}

        {(unallocatedTvs.length > 0 || orphanCameras.length > 0) && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
              Unassigned
            </Typography>
            <Stack spacing={1}>
              {unallocatedTvs.map((tvGroup) => (
                <TvRow
                  key={tvGroup.tv.ip}
                  group={tvGroup}
                  adbDevices={adbDevices}
                  onToggle={handleToggle}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onAssignCamera={setAssigningCamera}
                  onLinkTv={handleLinkTv}
                  onLinkCamera={handleLinkCamera}
                />
              ))}
              {orphanCameras.map((camera) => (
                <CameraRow
                  key={camera.id}
                  camera={camera}
                  adbStatus={adbStatusFor(adbDevices, camera.adbTarget)}
                  onToggle={handleToggle}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onAssign={() => setAssigningCamera(camera)}
                  onLink={() => handleLinkCamera(camera)}
                />
              ))}
            </Stack>
          </Paper>
        )}
      </Stack>

      {/* Edit label dialog */}
      <Dialog open={editing !== null} onClose={() => setEditing(null)}>
        <DialogTitle>Edit Label</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSaveLabel()}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={handleSaveLabel} variant="contained">
            Save
          </Button>
        </DialogActions>
      </Dialog>

      {/* Add device dialog */}
      <AddDeviceDialog
        open={addOpen}
        device={newDevice}
        onChange={setNewDevice}
        onAdd={handleAdd}
        onClose={() => setAddOpen(false)}
      />

      {/* Assign camera <-> adb host dialog */}
      <AssignCameraDialog
        camera={assigningCamera}
        adbDevices={adbDevices}
        usedTargets={usedAdbTargets}
        onAssign={handleAssign}
        onClose={() => setAssigningCamera(null)}
      />

      {/* Riconciliazione manuale: collega una TV/camera lab a un device Suitest */}
      <LinkSuitestDialog
        target={linking}
        candidates={linkCandidates}
        onLink={handleLinkSuitest}
        onClose={() => setLinking(null)}
      />
    </Box>
  );
}
