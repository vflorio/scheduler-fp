import { Dns } from "@mui/icons-material";
import { Paper, Stack } from "@mui/material";
import { EntryRow } from "@supervisor/ui/EntryRow";
import { PredicateDot } from "../../components/PredicateDot";
import { TvRow } from "./TvRow";
import type { CuGroup, RowActions } from "./types";

export function ControlUnitCard({
  group,
  adbDevices,
  onToggle,
  onEdit,
  onDelete,
  onAssignCamera,
  onLinkCamera,
}: { group: CuGroup } & RowActions) {
  return (
    <Paper variant="outlined" sx={{ p: 2 }}>
      <EntryRow
        icon={<Dns fontSize="small" />}
        label={group.cu.label}
        secondary={group.cu.id}
        checked={group.cu.controlled}
        checkedTitle="Controlled by supervisor"
        statusChips={[
          <PredicateDot
            key="p"
            domain="suitest-control-unit"
            entityId={group.cu.id}
            name="suitest_control_unit_online"
            label="Control unit online"
            colorFor={(value) => (value === undefined ? "disabled" : value ? "success" : "error")}
            detail={(value) => (value === undefined ? "unknown" : value ? "online" : "offline")}
          />,
        ]}
        onToggle={() => onToggle("candybox", group.cu.id, group.cu.controlled)}
        onEdit={() => onEdit("candybox", group.cu.id, group.cu.label)}
        onDelete={() => onDelete("candybox", group.cu.id)}
      />
      {group.tvs.length > 0 && (
        <Stack spacing={1} sx={{ mt: 1.5, pl: 3, borderLeft: "2px solid", borderColor: "divider" }}>
          {group.tvs.map((tvGroup) => (
            <TvRow
              key={tvGroup.tv.deviceId}
              group={tvGroup}
              adbDevices={adbDevices}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              onAssignCamera={onAssignCamera}
              onLinkCamera={onLinkCamera}
            />
          ))}
        </Stack>
      )}
    </Paper>
  );
}
