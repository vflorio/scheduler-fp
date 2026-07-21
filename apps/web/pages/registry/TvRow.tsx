import { MailOutlined, Tv } from "@mui/icons-material";
import { Box, Chip, Stack } from "@mui/material";
import { EntryRow } from "@supervisor/ui/EntryRow";
import * as O from "fp-ts/Option";
import { CameraRow } from "./CameraRow";
import { adbStatusFor } from "./hierarchy";
import type { RowActions, TvGroup } from "./types";

export function TvRow({
  group,
  adbDevices,
  onToggle,
  onEdit,
  onDelete,
  onAssignCamera,
  onLinkCamera,
}: { group: TvGroup } & RowActions) {
  const { tv } = group;
  const inUseLabel = tv.inUseBy?.email ?? tv.inUseBy?.orgName ?? tv.inUseBy?.tokenName;

  return (
    <Box>
      <EntryRow
        icon={<Tv fontSize="small" />}
        label={tv.label}
        secondary={O.toUndefined(tv.ip)}
        checked={tv.controlled}
        checkedTitle="Controlled by supervisor"
        statusChips={[
          inUseLabel ? (
            <Chip key="u" size="small" color="warning" icon={<MailOutlined fontSize="small" />} label={inUseLabel} />
          ) : (
            <Chip key="u" size="small" variant="outlined" label="Available" />
          ),
        ]}
        onToggle={() => onToggle("tv", tv.deviceId, tv.controlled)}
        onEdit={() => onEdit("tv", tv.deviceId, tv.label)}
        onDelete={() => onDelete("tv", tv.deviceId)}
      />
      {group.cameras.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1, pl: 3, borderLeft: "2px solid", borderColor: "divider" }}>
          {group.cameras.map((camera) => (
            <CameraRow
              key={camera.id}
              camera={camera}
              adbStatus={adbStatusFor(adbDevices, camera.adb?.target)}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onAssign={() => onAssignCamera(camera)}
              onLink={() => onLinkCamera(camera)}
            />
          ))}
        </Stack>
      )}
    </Box>
  );
}
