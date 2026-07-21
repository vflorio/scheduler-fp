import { Box } from "@mui/material";
import type { SxProps, Theme } from "@mui/material";
import { useRef } from "react";
import type { ElementType, PointerEvent as ReactPointerEvent, ReactNode } from "react";

// -------------------------------------------------------------------------------------
// Generic horizontally-resizable panel: a drag handle on one edge changes `size`, and
// dragging past `collapseThreshold` snaps the panel into a thin `collapsedSize` strip.
// Fully controlled - no layout/content knowledge, no persistence. The caller owns
// `size`/`collapsed` state and decides what the collapsed strip renders (e.g. an
// expand button), so the same primitive fits a sidebar or a log panel alike.
// -------------------------------------------------------------------------------------

export interface ResizablePanelProps {
  readonly handleSide: "left" | "right";
  readonly size: number;
  readonly onResize: (size: number) => void;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly collapsed: boolean;
  readonly onCollapsedChange: (collapsed: boolean) => void;
  readonly collapseThreshold?: number;
  readonly collapsedSize?: number;
  readonly collapsedContent?: ReactNode;
  readonly component?: ElementType;
  readonly sx?: SxProps<Theme>;
  readonly children: ReactNode;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startSize: number;
}

const HANDLE_HITBOX = 8;

export function ResizablePanel({
  handleSide,
  size,
  onResize,
  minSize = 160,
  maxSize = 600,
  collapsed,
  onCollapsedChange,
  collapseThreshold = 96,
  collapsedSize = 40,
  collapsedContent,
  component = "div",
  sx,
  children,
}: ResizablePanelProps) {
  const dragRef = useRef<DragState | null>(null);

  const startDragging = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startSize: collapsed ? collapseThreshold : size };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleDragging = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) return;

    const deltaX = event.clientX - drag.startX;
    const rawSize = handleSide === "left" ? drag.startSize - deltaX : drag.startSize + deltaX;

    if (rawSize < collapseThreshold) {
      if (!collapsed) onCollapsedChange(true);
      return;
    }
    if (collapsed) onCollapsedChange(false);
    onResize(Math.min(maxSize, Math.max(minSize, rawSize)));
  };

  const stopDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragRef.current = null;
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  };

  if (collapsed) {
    return (
      <Box
        component={component}
        onPointerDown={startDragging}
        onPointerMove={handleDragging}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        sx={{ flexShrink: 0, width: collapsedSize, cursor: "col-resize", ...sx }}
      >
        {collapsedContent}
      </Box>
    );
  }

  return (
    <Box
      component={component}
      sx={{ position: "relative", flexShrink: 0, width: size, minWidth: 0, overflow: "hidden", ...sx }}
    >
      {children}
      <Box
        onPointerDown={startDragging}
        onPointerMove={handleDragging}
        onPointerUp={stopDragging}
        onPointerCancel={stopDragging}
        sx={{
          position: "absolute",
          top: 0,
          bottom: 0,
          [handleSide]: -HANDLE_HITBOX / 2,
          width: HANDLE_HITBOX,
          cursor: "col-resize",
          zIndex: 1,
          "&:hover": { bgcolor: "action.hover" },
        }}
      />
    </Box>
  );
}
