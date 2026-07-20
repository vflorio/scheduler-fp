import { Box, Paper, Typography } from "@mui/material";
import { LEVEL_PALETTE, TAG_PALETTE } from "@supervisor/core/log-palette";
import { useEffect, useRef } from "react";
import { useLogFeed } from "../../hooks/useLogFeed";

const TIMESTAMP_COLOR = "#6e7681";
const INDENT_SIZE = 2;

// Quanto vicino al fondo bisogna essere (in px) per considerare l'utente "agganciato" all'ultima riga
const STICK_TO_BOTTOM_THRESHOLD = 48;

export function Logs() {
  const { entries, status } = useLogFeed();
  const viewportRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);

  useEffect(() => {
    const el = viewportRef.current;
    if (el && stickToBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [entries]);

  const handleScroll = () => {
    const el = viewportRef.current;
    if (!el) return;
    stickToBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < STICK_TO_BOTTOM_THRESHOLD;
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h5" sx={{ fontWeight: 600 }}>
        Service Logs
      </Typography>

      <Paper
        ref={viewportRef}
        onScroll={handleScroll}
        sx={{
          height: "calc(100vh - 180px)",
          overflow: "auto",
          bgcolor: "#0a0c10",
          p: 2,
          fontFamily: '"JetBrains Mono", "Fira Code", ui-monospace, Menlo, Consolas, monospace',
          fontSize: 13,
          lineHeight: 1.6,
        }}
      >
        {entries.length === 0 && (
          <Typography variant="body2" color="text.secondary">
            {status === "online" ? "Waiting for logs…" : "Connecting to service…"}
          </Typography>
        )}
        {entries.map((entry) => {
          const time = new Date(entry.timestamp).toLocaleTimeString("it-IT");
          const indent = " ".repeat(entry.depth * INDENT_SIZE);
          const tagColor = entry.color !== undefined ? TAG_PALETTE[entry.color % TAG_PALETTE.length]?.hex : undefined;

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
              {entry.message}
            </Box>
          );
        })}
      </Paper>
    </Box>
  );
}
