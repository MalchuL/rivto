import { createPortal } from "react-dom";
import type { EditorBlock } from "@chulane/rivto";
import type { PageDragController } from "../controller";
import { PageDragPreview } from "./component";

const PAGE_DRAG_OVERLAY_CLASS = "page-drag-overlay";

/** Renders the drag preview in the active modal layer, or the document body. */
export function PageDragOverlay({ root, controller, blocks, childrenVisible }: {
  readonly root: HTMLElement | null;
  readonly controller: PageDragController;
  readonly blocks: EditorBlock[];
  readonly childrenVisible: (block: EditorBlock) => boolean;
}) {
  // Native modal dialogs occupy the top layer; previews must join that layer.
  const overlayHost = root?.querySelector("dialog:modal") ?? root?.ownerDocument.body;
  if (!blocks.length || !overlayHost) return null;
  return createPortal(
    <div
      ref={(element) => { controller.previewElement = element; }}
      className={PAGE_DRAG_OVERLAY_CLASS}
      style={{ transform: `translate3d(${controller.previewPosition?.x ?? 0}px, ${controller.previewPosition?.y ?? 0}px, 0)` }}
      aria-hidden="true"
    >
      <PageDragPreview blocks={blocks} childrenVisible={childrenVisible} />
    </div>,
    overlayHost,
  );
}
