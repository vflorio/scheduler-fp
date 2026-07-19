import { Add, Delete, Dns, Edit, ExpandLess, ExpandMore, Tv, Videocam } from "@mui/icons-material";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Collapse,
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
import { useState } from "react";
import { match } from "ts-pattern";
import { reload } from "vike/client/router";
import { useData } from "vike-react/useData";
import { trpc } from "../../trpc/client";
import type { Data } from "./+data";

// -------------------------------------------------------------------------------------
// Types (mirrored from core)
// -------------------------------------------------------------------------------------

type DeviceCategory = "control-unit" | "android-camera" | "smart-tv";

interface DeviceEntry {
  label: string;
  ip: string;
  category: DeviceCategory;
  controlled: boolean;
}

// -------------------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------------------

const categoryIcon = (cat: DeviceCategory) => {
  switch (cat) {
    case "control-unit":
      return <Dns fontSize="small" />;
    case "android-camera":
      return <Videocam fontSize="small" />;
    case "smart-tv":
      return <Tv fontSize="small" />;
  }
};

const categoryLabel = (cat: DeviceCategory) => {
  switch (cat) {
    case "control-unit":
      return "Control Unit";
    case "android-camera":
      return "Camera";
    case "smart-tv":
      return "Smart TV";
  }
};

function groupDevices(devices: DeviceEntry[]) {
  const controlUnits = devices.filter((d) => d.category === "control-unit");
  const others = devices.filter((d) => d.category !== "control-unit");

  const cuWithChildren = controlUnits.map((cu) => {
    const cuPrefix = cu.ip.split(".").slice(0, 3).join(".");
    const children = others.filter((d) => d.ip.startsWith(`${cuPrefix}.`));
    return { cu, children };
  });

  const assignedIps = new Set(cuWithChildren.flatMap((g) => g.children.map((d) => d.ip)));
  const freeDevices = others.filter((d) => !assignedIps.has(d.ip));

  return { groups: cuWithChildren, freeDevices };
}

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

function RegistryList({ registry }: { registry: { devices: DeviceEntry[] } }) {
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [editingIp, setEditingIp] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newDevice, setNewDevice] = useState<DeviceEntry>({
    label: "",
    ip: "",
    category: "android-camera",
    controlled: true,
  });

  const handleToggle = (device: DeviceEntry) =>
    mutate(() => trpc.registry.update.mutate({ ip: device.ip, controlled: !device.controlled }), setError);

  const handleSaveLabel = (ip: string) =>
    mutate(async () => {
      const result = await trpc.registry.update.mutate({ ip, label: editLabel });
      if (result.ok) setEditingIp(null);
      return result;
    }, setError);

  const handleDelete = (ip: string) => mutate(() => trpc.registry.remove.mutate(ip), setError);

  const handleAdd = () =>
    mutate(async () => {
      if (!newDevice.label || !newDevice.ip)
        return { ok: false as const, error: { type: "ValidationError", message: "Label and IP required" } };
      const result = await trpc.registry.add.mutate(newDevice);
      if (result.ok) {
        setAddOpen(false);
        setNewDevice({ label: "", ip: "", category: "android-camera", controlled: true });
      }
      return result;
    }, setError);

  const toggleExpand = (ip: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(ip) ? next.delete(ip) : next.add(ip);
      return next;
    });

  const startEdit = (d: DeviceEntry) => {
    setEditingIp(d.ip);
    setEditLabel(d.label);
  };

  const { groups, freeDevices } = groupDevices(registry.devices);

  return (
    <Box>
      <Box sx={{ display: "flex", alignItems: "center", mb: 2, gap: 1 }}>
        <Typography variant="h5" sx={{ flexGrow: 1 }}>
          Device Registry
        </Typography>
        <Chip label={`${registry.devices.length} devices`} size="small" />
        <Chip
          label={`${registry.devices.filter((d) => d.controlled).length} controlled`}
          size="small"
          color="primary"
        />
        <IconButton onClick={() => setAddOpen(true)} color="primary" title="Add device">
          <Add />
        </IconButton>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      <List dense>
        {groups.map(({ cu, children }) => (
          <Box key={cu.ip}>
            <DeviceListItem
              device={cu}
              onToggle={handleToggle}
              onEdit={startEdit}
              onDelete={handleDelete}
              secondary={
                children.length > 0 ? (
                  <IconButton size="small" onClick={() => toggleExpand(cu.ip)}>
                    {expanded.has(cu.ip) ? <ExpandLess /> : <ExpandMore />}
                  </IconButton>
                ) : undefined
              }
            />
            {children.length > 0 && (
              <Collapse in={expanded.has(cu.ip)} unmountOnExit>
                <List dense sx={{ pl: 4 }}>
                  {children.map((child) => (
                    <DeviceListItem
                      key={child.ip}
                      device={child}
                      onToggle={handleToggle}
                      onEdit={startEdit}
                      onDelete={handleDelete}
                    />
                  ))}
                </List>
              </Collapse>
            )}
          </Box>
        ))}

        {freeDevices.length > 0 && (
          <>
            <Typography variant="overline" sx={{ pl: 2, pt: 1, display: "block", color: "text.secondary" }}>
              Unassigned
            </Typography>
            {freeDevices.map((device) => (
              <DeviceListItem
                key={device.ip}
                device={device}
                onToggle={handleToggle}
                onEdit={startEdit}
                onDelete={handleDelete}
              />
            ))}
          </>
        )}
      </List>

      {/* Edit label dialog */}
      <Dialog open={editingIp !== null} onClose={() => setEditingIp(null)}>
        <DialogTitle>Edit Label</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            fullWidth
            value={editLabel}
            onChange={(e) => setEditLabel(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && editingIp && handleSaveLabel(editingIp)}
            sx={{ mt: 1 }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditingIp(null)}>Cancel</Button>
          <Button onClick={() => editingIp && handleSaveLabel(editingIp)} variant="contained">
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

function DeviceListItem({
  device,
  onToggle,
  onEdit,
  onDelete,
  secondary,
}: {
  device: DeviceEntry;
  onToggle: (d: DeviceEntry) => void;
  onEdit: (d: DeviceEntry) => void;
  onDelete: (ip: string) => void;
  secondary?: React.ReactNode;
}) {
  return (
    <ListItem
      disablePadding
      secondaryAction={
        <Box sx={{ display: "flex", gap: 0.5 }}>
          {secondary}
          <IconButton size="small" onClick={() => onEdit(device)} title="Edit label">
            <Edit fontSize="small" />
          </IconButton>
          <IconButton size="small" onClick={() => onDelete(device.ip)} title="Remove">
            <Delete fontSize="small" />
          </IconButton>
        </Box>
      }
    >
      <ListItemButton onClick={() => onToggle(device)} dense>
        <ListItemIcon sx={{ minWidth: 36 }}>
          <Checkbox edge="start" checked={device.controlled} tabIndex={-1} disableRipple size="small" />
        </ListItemIcon>
        <ListItemIcon sx={{ minWidth: 32 }}>{categoryIcon(device.category)}</ListItemIcon>
        <ListItemText primary={device.label} secondary={`${device.ip} · ${categoryLabel(device.category)}`} />
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
  device: DeviceEntry;
  onChange: (d: DeviceEntry) => void;
  onAdd: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Add Device</DialogTitle>
      <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: "8px !important" }}>
        <TextField
          label="Label"
          value={device.label}
          onChange={(e) => onChange({ ...device, label: e.target.value })}
          fullWidth
        />
        <TextField
          label="IP Address"
          placeholder="192.168.1.100"
          value={device.ip}
          onChange={(e) => onChange({ ...device, ip: e.target.value })}
          fullWidth
        />
        <FormControl fullWidth>
          <InputLabel>Category</InputLabel>
          <Select
            value={device.category}
            label="Category"
            onChange={(e) => onChange({ ...device, category: e.target.value as DeviceCategory })}
          >
            <MenuItem value="control-unit">Control Unit</MenuItem>
            <MenuItem value="android-camera">Android Camera</MenuItem>
            <MenuItem value="smart-tv">Smart TV</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onAdd} variant="contained" disabled={!device.label || !device.ip}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
