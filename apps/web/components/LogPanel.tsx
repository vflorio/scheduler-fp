import { ChevronLeft, ChevronRight } from "@mui/icons-material";
import { Box, IconButton, MenuItem, Select, type SelectChangeEvent, Typography } from "@mui/material";
import { LEVEL_PALETTE, TAG_PALETTE } from "@supervisor/core/log-palette";
import { isLevelEnabled, type LogLevel, padContinuationLines } from "@supervisor/core/logger";
import { ResizablePanel } from "@supervisor/ui/ResizablePanel";
import { useEffect, useRef, useState } from "react";
import { useLogFeed } from "../hooks/useLogFeed";

const TIMESTAMP_COLOR = "#6e7681";
const INDENT_SIZE = 2;

// Livelli effettivamente emessi da Logger (fatal/trace/silent non sono mai loggati via Tagged)
const FILTERABLE_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

// Quanto vicino al fondo bisogna essere (in px) per considerare l'utente "agganciato" all'ultima riga
const STICK_TO_BOTTOM_THRESHOLD = 48;

const DEFAULT_WIDTH = 340;
const MIN_WIDTH = 220;
const MAX_WIDTH = 1024;
const COLLAPSE_THRESHOLD = 140;
const COLLAPSED_WIDTH = 40;

// Pannello log globale (in +Layout.tsx, visibile su ogni pagina), ridimensionabile
// trascinando il bordo sinistro e collassabile in una striscia laterale sottile -
export function LogPanel() {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const [collapsed, setCollapsed] = useState(false);
  const [minLevel, setMinLevel] = useState<LogLevel>("debug");
  const { entries, status } = useLogFeed();
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  const filteredEntries = entries.filter((entry) => isLevelEnabled(minLevel, entry.level));

  useEffect(() => {
    const el = viewportRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredEntries]);

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_THRESHOLD;
  };

  return (
    <ResizablePanel
      component="aside"
      handleSide="left"
      size={width}
      onResize={setWidth}
      minSize={MIN_WIDTH}
      maxSize={MAX_WIDTH}
      collapsed={collapsed}
      onCollapsedChange={setCollapsed}
      collapseThreshold={COLLAPSE_THRESHOLD}
      collapsedSize={COLLAPSED_WIDTH}
      collapsedContent={
        <Box sx={{ display: "flex", justifyContent: "center", pt: 2 }}>
          <IconButton size="small" onClick={() => setCollapsed(false)} title="Show logs">
            <ChevronLeft fontSize="small" />
          </IconButton>
        </Box>
      }
      sx={{
        borderLeft: "1px solid",
        borderColor: "divider",
        bgcolor: "background.paper",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", p: 1.5, pb: 1, gap: 1 }}>
        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
          Service Logs
        </Typography>
        <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
          <Select
            size="small"
            variant="standard"
            value={minLevel}
            onChange={(event: SelectChangeEvent) => setMinLevel(event.target.value as LogLevel)}
            sx={{ fontSize: 12, minWidth: 60 }}
          >
            {FILTERABLE_LEVELS.map((level) => (
              <MenuItem key={level} value={level} sx={{ fontSize: 12 }}>
                {level}
              </MenuItem>
            ))}
          </Select>
          <IconButton size="small" onClick={() => setCollapsed(true)} title="Hide logs">
            <ChevronRight fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      <Box
        ref={viewportRef}
        onScroll={handleScroll}
        sx={{
          flexGrow: 1,
          overflow: "auto",
          bgcolor: "#0a0c10",
          p: 1.5,
          fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace',
          fontSize: 12,
          lineHeight: 1.6,
        }}
      >
        {entries.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {status === "online" ? "Waiting for logs…" : "Connecting to service…"}
          </Typography>
        )}
        {entries.length > 0 && filteredEntries.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            No logs at "{minLevel}" level or above
          </Typography>
        )}
        {filteredEntries.map((entry) => {
          const time = new Date(entry.timestamp).toLocaleTimeString("it-IT");
          const indent = " ".repeat(entry.depth * INDENT_SIZE);
          const tagColor = entry.color !== undefined ? TAG_PALETTE[entry.color % TAG_PALETTE.length]?.hex : undefined;
          const tagText = entry.tag ? `[${entry.tag}] ` : "";
          const prefixWidth = `${time} | `.length + indent.length + tagText.length;
          const message = padContinuationLines(entry.message, prefixWidth);

          return (
            <Box
              key={entry.id}
              component="pre"
              sx={{
                m: 0,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                color: LEVEL_PALETTE[entry.level]?.hex ?? "text.primary",
              }}
            >
              <Box component="span" sx={{ color: TIMESTAMP_COLOR }}>
                {time} |{" "}
              </Box>
              {indent}
              {entry.tag && (
                <Box component="span" sx={{ color: tagColor, fontWeight: 600 }}>
                  [{entry.tag}]{" "}
                </Box>
              )}
              {message}
            </Box>
          );
        })}
      </Box>
    </ResizablePanel>
  );
}
