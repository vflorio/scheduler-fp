import { Add, Delete, Usb } from "@mui/icons-material";
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
import * as NetworkTarget from "@supervisor/core/network-target";
import * as E from "fp-ts/Either";
import { pipe } from "fp-ts/function";
import * as O from "fp-ts/Option";
import { useState } from "react";
import { match } from "ts-pattern";
import { useData } from "vike-react/useData";
import { Activity } from "../../components/Activity";
import { type AdbDevice, useAdbDevices } from "../../hooks/useAdbDevices";
import type { Data } from "../index/+data";
import { AddDeviceDialog } from "./AddDeviceDialog";
import { AssignCameraDialog } from "./AssignCameraDialog";
import { CameraRow } from "./CameraRow";
import { ControlUnitCard } from "./ControlUnitCard";
import { adbStatusFor, buildHierarchy, cameraSuitestCandidates } from "./hierarchy";
import { LinkSuitestDialog } from "./LinkSuitestDialog";
import { mutate, mutations } from "./mutations";
import { TvRow } from "./TvRow";
import type { CameraView, Db, DeviceKind, LinkingTarget, NewAdbTargetForm } from "./types";
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

const emptyNewAdbTarget: NewAdbTargetForm = { label: "", target: "" };

function HierarchyView({ db, adbDevices }: { db: Db; adbDevices: readonly AdbDevice[] }) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: DeviceKind; id: string; label: string } | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newAdbTarget, setNewAdbTarget] = useState<NewAdbTargetForm>(emptyNewAdbTarget);
  const [assigningCamera, setAssigningCamera] = useState<CameraView | null>(null);
  const [linking, setLinking] = useState<LinkingTarget | null>(null);

  const handleToggle = (kind: DeviceKind, id: string, controlled: boolean) =>
    mutate(
      () =>
        match(kind)
          .with("candybox", () => mutations.candybox.update.mutate({ id, controlled: !controlled }))
          .with("camera", () => mutations.camera.update.mutate({ id, controlled: !controlled }))
          .with("tv", () => mutations.tv.update.mutate({ deviceId: id, controlled: !controlled }))
          .exhaustive(),
      setError,
    );

  const handleSaveLabel = () =>
    mutate(async () => {
      if (!editing) return { ok: false as const, error: { type: "ValidationError", message: "Nothing to edit" } };

      const result = await match(editing.kind)
        .with("candybox", () => mutations.candybox.update.mutate({ id: editing.id, label: editLabel }))
        .with("camera", () => mutations.camera.update.mutate({ id: editing.id, label: editLabel }))
        .with("tv", () => mutations.tv.update.mutate({ deviceId: editing.id, label: editLabel }))
        .exhaustive();
      if (result.ok) setEditing(null);
      return result;
    }, setError);

  const handleDelete = (kind: DeviceKind, id: string) =>
    mutate(
      () =>
        match(kind)
          .with("candybox", () => mutations.candybox.remove.mutate(id))
          .with("camera", () => mutations.camera.remove.mutate(id))
          .with("tv", () => mutations.tv.remove.mutate(id))
          .exhaustive(),
      setError,
    );

  const handleDeleteAdb = (id: string) => mutate(() => mutations.adb.remove.mutate(id), setError);

  // Assegna un host ADB a una camera: upsert (idempotente, chiave = target stesso) del target
  // nel registro `adb`, poi collega la camera via foreign key `adbId`.
  const handleAssign = (target: string) =>
    mutate(async () => {
      if (!assigningCamera) return { ok: false as const, error: { type: "ValidationError", message: "No camera" } };

      const decoded = NetworkTarget.decode(target);
      if (E.isLeft(decoded)) return { ok: false as const, error: decoded.left };

      const id = NetworkTarget.format(decoded.right);
      const addResult = await mutations.adb.add.mutate({ id, label: id, target: decoded.right });
      if (!addResult.ok) return addResult;

      const result = await mutations.camera.update.mutate({ id: assigningCamera.id, adbId: O.some(id) });
      if (result.ok) setAssigningCamera(null);
      return result;
    }, setError);

  const handleLinkSuitest = (videoCaptureDeviceId: string) =>
    mutate(async () => {
      if (!linking) return { ok: false as const, error: { type: "ValidationError", message: "Nothing to link" } };

      const result = await mutations.camera.update.mutate({
        id: linking.id,
        videoCaptureDeviceId: O.some(videoCaptureDeviceId),
      });
      if (result.ok) setLinking(null);
      return result;
    }, setError);

  const handleAdd = () =>
    mutate(async () => {
      if (!newAdbTarget.label)
        return { ok: false as const, error: { type: "ValidationError", message: "Label required" } };

      const decoded = NetworkTarget.decode(newAdbTarget.target);
      if (E.isLeft(decoded)) return { ok: false as const, error: decoded.left };

      const id = NetworkTarget.format(decoded.right);
      const result = await mutations.adb.add.mutate({ id, label: newAdbTarget.label, target: decoded.right });

      if (result.ok) {
        setAddOpen(false);
        setNewAdbTarget(emptyNewAdbTarget);
      }
      return result;
    }, setError);

  const startEdit = (kind: DeviceKind, id: string, label: string) => {
    setEditing({ kind, id, label });
    setEditLabel(label);
  };

  const handleLinkCamera = (camera: CameraView) =>
    setLinking({ id: camera.id, currentVideoCaptureDeviceId: O.toUndefined(camera.videoCaptureDeviceId) });

  const { cuGroups, unallocatedTvs, orphanCameras } = buildHierarchy(db);

  const totalDevices =
    Object.keys(db.lab.candyboxes).length + Object.keys(db.lab.cameras).length + Object.keys(db.lab.tvs).length;

  const totalControlled =
    Object.values(db.lab.candyboxes).filter((d) => d.controlled).length +
    Object.values(db.lab.cameras).filter((d) => d.controlled).length +
    Object.values(db.lab.tvs).filter((d) => d.controlled).length;

  const usedAdbTargets = new Set(
    Object.values(db.lab.cameras)
      .map((c) =>
        pipe(
          c.adbId,
          O.chain((id) => O.fromNullable(db.lab.adb[id])),
          O.map((entry) => NetworkTarget.format(entry.target)),
        ),
      )
      .filter(O.isSome)
      .map((o) => o.value),
  );

  const linkCandidates = linking ? cameraSuitestCandidates(db, linking.currentVideoCaptureDeviceId) : [];

  return (
    <Activity
      title="Device Registry"
      actions={
        <>
          <Chip label={`${totalDevices} devices`} size="small" />
          <Chip label={`${totalControlled} controlled`} size="small" color="primary" />
          <IconButton onClick={() => setAddOpen(true)} color="primary" title="Add ADB Target">
            <Add />
          </IconButton>
        </>
      }
    >
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
                  key={tvGroup.tv.deviceId}
                  group={tvGroup}
                  adbDevices={adbDevices}
                  onToggle={handleToggle}
                  onEdit={startEdit}
                  onDelete={handleDelete}
                  onAssignCamera={setAssigningCamera}
                  onLinkCamera={handleLinkCamera}
                />
              ))}
              {orphanCameras.map((camera) => (
                <CameraRow
                  key={camera.id}
                  camera={camera}
                  adbStatus={adbStatusFor(adbDevices, camera.adb?.target)}
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

        {Object.keys(db.lab.adb).length > 0 && (
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Typography variant="overline" sx={{ color: "text.secondary", display: "block", mb: 1 }}>
              ADB Targets
            </Typography>
            <Stack spacing={1}>
              {Object.values(db.lab.adb).map((entry) => (
                <Box key={entry.id} sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.5 }}>
                  <Box sx={{ color: "text.secondary", display: "flex" }}>
                    <Usb fontSize="small" />
                  </Box>
                  <Box sx={{ minWidth: 0, flexGrow: 1 }}>
                    <Typography variant="body2" sx={{ fontWeight: 500 }}>
                      {entry.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {NetworkTarget.format(entry.target)}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => handleDeleteAdb(entry.id)} title="Remove">
                    <Delete fontSize="small" />
                  </IconButton>
                </Box>
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

      {/* Add ADB target dialog */}
      <AddDeviceDialog
        open={addOpen}
        device={newAdbTarget}
        onChange={setNewAdbTarget}
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

      {/* Riconciliazione manuale: collega una camera a un video-capture-device Suitest */}
      <LinkSuitestDialog
        target={linking}
        candidates={linkCandidates}
        onLink={handleLinkSuitest}
        onClose={() => setLinking(null)}
      />
    </Activity>
  );
}
