/** Surface-sized fallback drop target for page drag gestures. */
import { useDroppable } from "@dnd-kit/core";
import { useLayoutEffect } from "react";
import { PAGE_DRAG_SURFACE_ID } from "./collision";

/** Registers one surface-sized dnd-kit target; block targeting uses native hit testing. */
export function PageDragSurfaceDropTarget({ root }: { readonly root: HTMLElement | null }) {
  const droppable = useDroppable({ id: PAGE_DRAG_SURFACE_ID });
  useLayoutEffect(() => {
    droppable.setNodeRef(root);
    return () => droppable.setNodeRef(null);
  }, [droppable.setNodeRef, root]);
  return null;
}
