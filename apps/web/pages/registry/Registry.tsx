import { Add, Delete, Dns, Edit, Tv, Videocam } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import type { ReactNode } from "react";
import { useState } from "react";
import { match } from "ts-pattern";
import { reload } from "vike/client/router";
import { useData } from "vike-react/useData";
import { trpc } from "../../trpc/client";
import type { Data } from "./+data";

// -------------------------------------------------------------------------------------
// Types (mirrored from core - modelli distinti per categoria, non un unico DeviceEntry)
// -------------------------------------------------------------------------------------

type DeviceKind = "control-unit" | "camera" | "tv";

interface ControlUnitEntry {
  id: string;
  label: string;
  online: boolean;
  controlled: boolean;
}

interface CameraEntry {
  label: string;
  ip: string;
  controlled: boolean;
}

interface TvEntry {
  label: string;
  ip: string;
  controlled: boolean;
}

interface RegistryData {
  devices: {
    controlUnits: ControlUnitEntry[];
    cameras: CameraEntry[];
    tvs: TvEntry[];
  };
}

// -------------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------------

const kindIcon = (kind: DeviceKind) =>
  match(kind)
    .with("control-unit", () => <Dns fontSize="small" />)
    .with("camera", () => <Videocam fontSize="small" />)
    .with("tv", () => <Tv fontSize="small" />)
    .exhaustive();

const kindLabel = (kind: DeviceKind) =>
  match(kind)
    .with("control-unit", () => "Control Unit")
    .with("camera", () => "Camera")
    .with("tv", () => "Smart TV")
    .exhaustive();

const identifierLabel = (kind: DeviceKind) => (kind === "control-unit" ? "Control Unit ID" : "IP Address");

// -------------------------------------------------------------------------------------
// tRPC dispatch (per-kind, identità diversa: `id` per le control unit, `ip` per il resto)
// -------------------------------------------------------------------------------------

const mutations = {
  "control-unit": trpc.registry.controlUnits,
  camera: trpc.registry.cameras,
  tv: trpc.registry.tvs,
} as const;

// -------------------------------------------------------------------------------------
// Mutate + reload helpers
// -------------------------------------------------------------------------------------

async function mutate<T>(
  fn: () => Promise<{ ok: true; data: T } | { ok: false; error: { message: string } }>,
  setError: (msg: string | null) => void,
) {
  const result = await fn();
  if (result.ok) {
    setError(null);
    await reload();
  } else {
    setError(result.error.message);
  }
}

// -------------------------------------------------------------------------------------
// Component
// -------------------------------------------------------------------------------------

export function RegistryView() {
  const { registry } = useData<Data>();

  return match(registry)
    .with({ ok: true }, ({ data }) => <RegistryList registry={data} />)
    .with({ ok: false }, ({ error }) => <Alert severity="error">Registry error: {error.message}</Alert>)
    .exhaustive();
}

interface NewDeviceForm {
  kind: DeviceKind;
  label: string;
  identifier: string;
  controlled: boolean;
}

const emptyNewDevice: NewDeviceForm = { kind: "camera", label: "", identifier: "", controlled: true };

function RegistryList({ registry }: { registry: RegistryData }) {
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ kind: DeviceKind; id: string } | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newDevice, setNewDevice] = useState<NewDeviceForm>(emptyNewDevice);

  const handleToggle = (kind: DeviceKind, id: string, controlled: boolean) =>
    mutate(
      () =>
        match(kind)
          .with("control-unit", () => mutations["control-unit"].update.mutate({ id, controlled: !controlled }))
          .with("camera", () => mutations.camera.update.mutate({ ip: id, controlled: !controlled }))
          .with("tv", () => mutations.tv.update.mutate({ ip: id, controlled: !controlled }))
          .exhaustive(),
      setError,
    );

  const handleSaveLabel = (kind: DeviceKind, id: string) =>
    mutate(async () => {
      const result = await match(kind)
        .with("control-unit", () => mutations["control-unit"].update.mutate({ id, label: editLabel }))
        .with("camera", () => mutations.camera.update.mutate({ ip: id, label: editLabel }))
        .with("tv", () => mutations.tv.update.mutate({ ip: id, label: editLabel }))
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

  const handleAdd = () =>
    mutate(async () => {
      if (!newDevice.label || !newDevice.identifier)
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
            online: false,
          }),
        )
        .with("camera", () =>
          mutations.camera.add.mutate({
            ip: newDevice.identifier,
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
    setEditing({ kind, id });
    setEditLabel(label);
  };

  const totalDevices =
    registry.devices.controlUnits.length + registry.devices.cameras.length + registry.devices.tvs.length;
  const totalControlled =
    registry.devices.controlUnits.filter((d) => d.controlled).length +
    registry.devices.cameras.filter((d) => d.controlled).length +
    registry.devices.tvs.filter((d) => d.controlled).length;

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2, gap: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
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

      <DeviceSection
        kind="control-unit"
        devices={registry.devices.controlUnits.map((d) => ({
          id: d.id,
          label: d.label,
          controlled: d.controlled,
          secondary: `${d.id} · ${d.online ? "online" : "offline"}`,
        }))}
        onToggle={handleToggle}
        onEdit={startEdit}
        onDelete={handleDelete}
      />
      <DeviceSection
        kind="camera"
        devices={registry.devices.cameras.map((d) => ({
          id: d.ip,
          label: d.label,
          controlled: d.controlled,
          secondary: d.ip,
        }))}
        onToggle={handleToggle}
        onEdit={startEdit}
        onDelete={handleDelete}
      />
      <DeviceSection
        kind="tv"
        devices={registry.devices.tvs.map((d) => ({
          id: d.ip,
          label: d.label,
          controlled: d.controlled,
          secondary: d.ip,
        }))}
        onToggle={handleToggle}
        onEdit={startEdit}
        onDelete={handleDelete}
      />

      {/* Edit label dialog */}
      <Dialog open={editing !== null} onClose={() => setEditing(null)}>
        <DialogTitle>Edit Label</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && editing && handleSaveLabel(editing.kind, editing.id)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancel</Button>
          <Button onClick={() => editing && handleSaveLabel(editing.kind, editing.id)} variant="contained">
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
    </Box>
  );
}

// -------------------------------------------------------------------------------------
// Sub-components
// -------------------------------------------------------------------------------------

interface SectionDevice {
  id: string;
  label: string;
  controlled: boolean;
  secondary: string;
}

function DeviceSection({
  kind,
  devices,
  onToggle,
  onEdit,
  onDelete,
}: {
  kind: DeviceKind;
  devices: SectionDevice[];
  onToggle: (kind: DeviceKind, id: string, controlled: boolean) => void;
  onEdit: (kind: DeviceKind, id: string, label: string) => void;
  onDelete: (kind: DeviceKind, id: string) => void;
}) {
  if (devices.length === 0) return null;

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="overline" sx={{ pl: 2, display: "block", color: "text.secondary" }}>
        {kindLabel(kind)}s
      </Typography>
      <List dense>
        {devices.map((device) => (
          <DeviceListItem
            key={device.id}
            icon={kindIcon(kind)}
            device={device}
            onToggle={() => onToggle(kind, device.id, device.controlled)}
            onEdit={() => onEdit(kind, device.id, device.label)}
            onDelete={() => onDelete(kind, device.id)}
          />
        ))}
      </List>
    </Box>
  );
}

function DeviceListItem({
  icon,
  device,
  onToggle,
  onEdit,
  onDelete,
}: {
  icon: ReactNode;
  device: SectionDevice;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Box sx={{ display: "flex", gap: 0.5 }}>
          <IconButton size="small" onClick={onEdit} title="Edit label">
            <Edit fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={onDelete} title="Remove">
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      <ListItemButton onClick={onToggle} dense>
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Checkbox edge="start" checked={device.controlled} tabIndex={-1} disableRipple size="small" />
        </ListItemIcon>
        <ListItemIcon sx={{ minWidth: 32 }}>{icon}</ListItemIcon>
        <ListItemText primary={device.label} secondary={device.secondary} />
      </ListItemButton>
    </ListItem>
  );
}

function AddDeviceDialog({
  open,
  device,
  onChange,
  onAdd,
  onClose,
}: {
  open: boolean;
  device: NewDeviceForm;
  onChange: (d: NewDeviceForm) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Device</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <FormControl fullWidth>
          <InputLabel>Kind</InputLabel>
          <Select
            value={device.kind}
            label="Kind"
            onChange={(e) => onChange({ ...device, kind: e.target.value as DeviceKind })}
          >
            <MenuItem value="control-unit">Control Unit</MenuItem>
            <MenuItem value="camera">Android Camera</MenuItem>
            <MenuItem value="tv">Smart TV</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="Label"
          value={device.label}
          onChange={(e) => onChange({ ...device, label: e.target.value })}
          fullWidth
        />
        <TextField
          label={identifierLabel(device.kind)}
          placeholder={device.kind === "control-unit" ? "cu-001" : "192.168.1.100"}
          value={device.identifier}
          onChange={(e) => onChange({ ...device, identifier: e.target.value })}
          fullWidth
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onAdd} variant="contained" disabled={!device.label || !device.identifier}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
