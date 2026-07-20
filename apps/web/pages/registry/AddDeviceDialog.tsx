import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
  Typography,
} from "@mui/material";
import type { DeviceKind, NewDeviceForm } from "./types";

const identifierLabel = (kind: DeviceKind) => (kind === "control-unit" ? "Control Unit ID" : "IP Address");

export function AddDeviceDialog({
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
  const needsIdentifier = device.kind !== "camera";
  const canSubmit = device.label && (!needsIdentifier || device.identifier);

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
            <MenuItem value="camera">Camera</MenuItem>
            <MenuItem value="tv">Smart TV</MenuItem>
          </Select>
        </FormControl>
        <TextField
          label="Label"
          value={device.label}
          onChange={(e) => onChange({ ...device, label: e.target.value })}
          fullWidth
        />
        {needsIdentifier && (
          <TextField
            label={identifierLabel(device.kind)}
            placeholder={device.kind === "control-unit" ? "cu-001" : "192.168.1.100"}
            value={device.identifier}
            onChange={(e) => onChange({ ...device, identifier: e.target.value })}
            fullWidth
          />
        )}
        <Typography variant="caption" color="text.secondary">
          Il dominio applicativo (label/controlled/ip) è indipendente da Suitest e va preconfigurato qui. Potrai
          collegarlo a un device Suitest in seguito con "Link Suitest", e un host ADB con "Assign ADB Host".
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button onClick={onAdd} variant="contained" disabled={!canSubmit}>
          Add
        </Button>
      </DialogActions>
    </Dialog>
  );
}
