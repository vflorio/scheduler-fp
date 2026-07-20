import { Box, Paper, Typography } from "@mui/material";
import { useEffect, useRef } from "react";
import { useLogFeed } from "../../hooks/useLogFeed";

const LEVEL_COLORS: Record<string, string> = {
  fatal: "#ff6b6b",
  error: "#ff6b6b",
  warn: "#e3b341",
  info: "#79c0ff",
  debug: "#8b949e",
  trace: "#8b949e",
};

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
        {entries.map((entry) => (
          <Box
            key={entry.id}
            component="pre"
            sx={{
              m: 0,
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              color: LEVEL_COLORS[entry.level] ?? "text.primary",
            }}
          >
            {entry.message}
          </Box>
        ))}
      </Paper>
    </Box>
  );
}
