import type { SxProps, Theme } from "@mui/material";
import { Box } from "@mui/material";
import type { ElementType, ReactNode, PointerEvent as ReactPointerEvent } from "react";
import { useRef, useState } from "react";

export interface ResizablePanelProps {
  readonly handleSide: "left" | "right";
  readonly size: number;
  readonly onResize: (size: number) => void;
  readonly minSize?: number;
  readonly maxSize?: number;
  readonly component?: ElementType;
  readonly sx?: SxProps<Theme>;
  readonly children: ReactNode;
}

interface DragState {
  readonly pointerId: number;
  readonly startX: number;
  readonly startSize: number;
  readonly activationTimer: ReturnType<typeof setTimeout>;
}

const HANDLE_HITBOX = 8;
const ACTIVATION_DELAY_MS = 500;

export function ResizablePanel({
  handleSide,
  size,
  onResize,
  minSize = 160,
  maxSize = 600,
  component = "div",
  sx,
  children,
}: ResizablePanelProps) {
  const dragRef = useRef<DragState | null>(null);
  const [isActive, setIsActive] = useState(false);

  const startDragging = (event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.style.cursor = "col-resize";
    const activationTimer = setTimeout(() => {
      setIsActive(true);
      document.body.style.userSelect = "none";
    }, ACTIVATION_DELAY_MS);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startSize: size,
      activationTimer,
    };
  };

  const handleDragging = (event: ReactPointerEvent<HTMLElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId || !isActive) return;

    const deltaX = event.clientX - drag.startX;
    const rawSize = handleSide === "left" ? drag.startSize - deltaX : drag.startSize + deltaX;
    onResize(Math.min(maxSize, Math.max(minSize, rawSize)));
  };

  const stopDragging = (event: ReactPointerEvent<HTMLElement>) => {
    if (!dragRef.current || event.pointerId !== dragRef.current.pointerId) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    clearTimeout(dragRef.current.activationTimer);
    dragRef.current = null;
    setIsActive(false);
    document.body.style.removeProperty("cursor");
    document.body.style.removeProperty("user-select");
  };

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
          display: "flex",
          justifyContent: "center",
          cursor: "col-resize",
          zIndex: 1,
          "&:hover": { bgcolor: isActive ? undefined : "action.hover" },
        }}
      >
        <Box
          sx={{
            width: isActive ? 4 : 2,
            height: "100%",
            bgcolor: isActive ? "primary.main" : "transparent",
            transition: "width 0.1s, background-color 0.1s",
          }}
        />
      </Box>
    </Box>
  );
}
