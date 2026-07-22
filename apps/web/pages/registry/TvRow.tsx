import { Tv } from "@mui/icons-material";
import { Box, Stack } from "@mui/material";
import { EntryRow } from "@supervisor/ui/EntryRow";
import * as O from "fp-ts/Option";
import { PredicateDot } from "../../components/PredicateDot";
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
          <PredicateDot
            key="u"
            domain="suitest-device"
            entityId={tv.deviceId}
            name="suitest_device_in_use"
            label="In use"
            colorFor={(value) => (value === undefined ? "disabled" : value ? "warning" : "disabled")}
            detail={inUseLabel ?? "available"}
          />,
          <PredicateDot
            key="s"
            domain="suitest-device"
            entityId={tv.deviceId}
            name="suitest_device_status"
            label="Device status"
            colorFor={(value) =>
              value === undefined
                ? "disabled"
                : value === "READY"
                  ? "success"
                  : value === "OFFLINE"
                    ? "error"
                    : "warning"
            }
            detail={(value) => (value === undefined ? "unknown" : String(value))}
          />,
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
