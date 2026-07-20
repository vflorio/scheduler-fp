import { Delete, Edit } from "@mui/icons-material";
import { Box, Checkbox, IconButton, Stack, Typography } from "@mui/material";
import type { ReactNode } from "react";

// -------------------------------------------------------------------------------------
// Generic list-entry row: icon + label/secondary + a boolean toggle + status chips + edit/delete
// actions. No knowledge of what it represents - the caller decides icon, chips and semantics.
// -------------------------------------------------------------------------------------

export interface EntryRowProps {
  readonly icon: ReactNode;
  readonly label: string;
  readonly secondary?: string;
  readonly checked: boolean;
  readonly checkedTitle?: string;
  readonly statusChips?: ReactNode[];
  readonly onToggle: () => void;
  readonly onEdit: () => void;
  readonly onDelete: () => void;
}

export function EntryRow({
  icon,
  label,
  secondary,
  checked,
  checkedTitle,
  statusChips = [],
  onToggle,
  onEdit,
  onDelete,
}: EntryRowProps) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, py: 0.5 }}>
      <Checkbox checked={checked} onChange={onToggle} size="small" title={checkedTitle} />
      <Box sx={{ color: "text.secondary", display: "flex" }}>{icon}</Box>
      <Box sx={{ minWidth: 0, flexShrink: 0 }}>
        <Typography variant="body2" sx={{ fontWeight: 500 }}>
          {label}
        </Typography>
        {secondary && (
          <Typography variant="caption" color="text.secondary">
            {secondary}
          </Typography>
        )}
      </Box>
      <Stack direction="row" spacing={1} sx={{ flexGrow: 1, flexWrap: "wrap" }}>
        {statusChips}
      </Stack>
      <IconButton size="small" onClick={onEdit} title="Edit label">
        <Edit fontSize="small" />
      </IconButton>
      <IconButton size="small" onClick={onDelete} title="Remove">
        <Delete fontSize="small" />
      </IconButton>
    </Box>
  );
}
