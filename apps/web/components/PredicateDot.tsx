import { FiberManualRecord } from "@mui/icons-material";
import { Tooltip } from "@mui/material";
import { factKey, type PredicateValue } from "@supervisor/core/predicates/model";
import { usePredicates } from "../hooks/usePredicates";

// -------------------------------------------------------------------------------------
// Pallino di stato che riflette in tempo reale il valore corrente di un predicato di
// tracking (vedi usePredicates)
// -------------------------------------------------------------------------------------

export type DotColor = "success" | "error" | "warning" | "info" | "disabled";

const DOT_SX_COLOR: Record<DotColor, string> = {
  success: "success.main",
  error: "error.main",
  warning: "warning.main",
  info: "info.main",
  disabled: "text.disabled",
};

export interface PredicateDotProps {
  readonly domain: string;
  readonly entityId: string;
  readonly name: string;
  readonly label: string;
  readonly colorFor: (value: PredicateValue | undefined) => DotColor;
  readonly detail?: string | ((value: PredicateValue | undefined) => string);
}

export function PredicateDot({ domain, entityId, name, label, colorFor, detail }: PredicateDotProps) {
  const { table } = usePredicates();
  const entry = table.get(factKey({ domain, entityId, name }));
  const detailText =
    typeof detail === "function" ? detail(entry?.value) : (detail ?? String(entry?.value ?? "unknown"));

  return (
    <Tooltip title={`${label} (${detailText})`}>
      <FiberManualRecord sx={{ fontSize: 10, color: DOT_SX_COLOR[colorFor(entry?.value)] }} />
    </Tooltip>
  );
}
