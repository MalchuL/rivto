"use client";

import { useRef } from "react";
import { cn } from "@/lib/utils";

/** Thin vertical drag handle; reports pointer clientX while dragging. */
export function ResizeHandle({
  onDrag,
  className,
}: {
  onDrag: (clientX: number) => void;
  className?: string;
}) {
  const dragging = useRef(false);
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      className={cn(
        "w-1 shrink-0 cursor-col-resize bg-transparent transition-colors hover:bg-ring/30 active:bg-ring/50",
        className,
      )}
      onPointerDown={(event) => {
        dragging.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (dragging.current) onDrag(event.clientX);
      }}
      onPointerUp={(event) => {
        dragging.current = false;
        event.currentTarget.releasePointerCapture(event.pointerId);
      }}
    />
  );
}
