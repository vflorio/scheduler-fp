import { Link as LinkIcon, MailOutlined, Tv } from "@mui/icons-material";
import { Box, Chip, Stack } from "@mui/material";
import { EntryRow } from "@supervisor/ui/EntryRow";
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
  onLinkTv,
  onLinkCamera,
}: { group: TvGroup } & RowActions) {
  const { tv } = group;
  const inUseLabel = tv.inUseBy?.email ?? tv.inUseBy?.orgName ?? tv.inUseBy?.tokenName;

  return (
    <Box>
      <EntryRow
        icon={<Tv fontSize="small" />}
        label={tv.label}
        secondary={tv.ip}
        checked={tv.controlled}
        checkedTitle="Controlled by supervisor"
        statusChips={[
          tv.suitestId ? (
            inUseLabel ? (
              <Chip key="u" size="small" color="warning" icon={<MailOutlined fontSize="small" />} label={inUseLabel} />
            ) : (
              <Chip key="u" size="small" variant="outlined" label="Available" />
            )
          ) : (
            <Chip
              key="u"
              size="small"
              variant="outlined"
              color="default"
              icon={<LinkIcon fontSize="small" />}
              label="Link Suitest"
              onClick={() => onLinkTv(tv)}
            />
          ),
        ]}
        onToggle={() => onToggle("tv", tv.ip, tv.controlled)}
        onEdit={() => onEdit("tv", tv.ip, tv.label)}
        onDelete={() => onDelete("tv", tv.ip)}
      />
      {group.cameras.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1, pl: 3, borderLeft: "2px solid", borderColor: "divider" }}>
          {group.cameras.map((camera) => (
            <CameraRow
              key={camera.id}
              camera={camera}
              adbStatus={adbStatusFor(adbDevices, camera.adbTarget)}
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
