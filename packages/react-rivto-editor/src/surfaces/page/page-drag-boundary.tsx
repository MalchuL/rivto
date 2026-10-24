import { useLayoutEffect, type ReactNode } from "react";
import { BlockDragExtension, BlockOutlineDropTargets } from "@chulane/rivto-page";
import { useReactPanelContext } from "../../hooks/editor/use-react-panel-context";
import type { PageDragExtensionOptions } from "../../extensions/block-drag/types";
import { PageDragContext } from "./page-drag-context";
import { useEditorRoot } from "../../hooks/editor/use-editor-root";
import { PageBlockDrag } from "./page-block-drag";

/** Existing surface subtree borrowed by the optional Page drag installation. */
export interface PageDragBoundaryProps extends Omit<PageDragExtensionOptions, "children"> {
  readonly children?: ReactNode;
}

/**
 * Installs Page's pointer owner against the existing occurrence and panel commands.
 *
 * The effect owns the drag adapter attachment and extension registration. Removing
 * the host extension cancels its gesture, unregisters its receiving occurrence and
 * releases listeners; the panel continues to own its Page controller.
 *
 * @param props - Existing surface content, without an additional DOM wrapper.
 * @param props.children - Subtree rendered by the surface boundary.
 * @param props.childDropIndent - Horizontal pixels needed for a nested outline destination.
 * @param props.allowChildPlacement - Whether ordinary rows accept child insertion.
 * @param props.activationDistance - Pointer travel in CSS pixels before activation.
 * @param props.gapDropZone - Row-edge thickness in CSS pixels reserved for insertion gaps.
 * @param props.outerEdgeDropZone - Nested receiving-edge zone in viewport CSS pixels.
 * @returns The same subtree with optional pointer dragging installed after commit.
 */
export function PageDragBoundary({
  children,
  childDropIndent = 24,
  allowChildPlacement = true,
  activationDistance = 4,
  gapDropZone = 8,
  outerEdgeDropZone = 8,
}: PageDragBoundaryProps) {
  const { reactPanel } = useReactPanelContext();
  const { element } = useEditorRoot();
  useLayoutEffect(() => {
    if (!element) {
      return;
    }
    const drag = new PageBlockDrag(reactPanel, outerEdgeDropZone);
    const detach = drag.attach(
      element,
      new BlockOutlineDropTargets(
        reactPanel.page,
        reactPanel.rootBlockId ?? null,
        childDropIndent,
        allowChildPlacement,
        gapDropZone,
        () =>
          Number(element.closest<HTMLElement>("[data-edgeless-zoom]")?.dataset.edgelessZoom) || 1,
      ),
    );
    try {
      const stop = reactPanel.page.extensions.register(
        "host.drag",
        new BlockDragExtension(drag, drag, activationDistance),
      );
      return () => {
        const errors: unknown[] = [];
        for (const release of [stop, detach]) {
          try {
            release();
          } catch (error) {
            errors.push(error);
          }
        }
        if (errors.length) {
          throw new AggregateError(errors, "Page drag cleanup failed");
        }
      };
    } catch (error) {
      try {
        detach();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Page drag setup failed during cleanup");
      }
      throw error;
    }
  }, [
    reactPanel,
    element,
    childDropIndent,
    allowChildPlacement,
    activationDistance,
    gapDropZone,
    outerEdgeDropZone,
  ]);
  return <PageDragContext.Provider value={true}>{children}</PageDragContext.Provider>;
}
