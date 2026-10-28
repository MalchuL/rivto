import { GripVertical } from "lucide-react";
import { Button } from "../components/ui/button";
import type { BlockSlotProps } from "../slots/types";

/**
 * Marks an explicit pointer handle consumed by the optional drag extension.
 *
 * @param props - Owner supplied by the slot registry.
 * @param props.block - Stable identity used for the accessible label.
 * @returns A package-sized handle; installing it alone never mutates data.
 */
export function BlockDragHandle({ block }: BlockSlotProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      data-block-drag-handle=""
      aria-label={`Drag ${block.id}`}
      className="rivto-block-drag-handle"
    >
      <GripVertical aria-hidden="true" />
    </Button>
  );
}
