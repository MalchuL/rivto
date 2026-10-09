/**
 * dnd-kit integration for atomic movement of one block subtree or an eligible
 * sibling-root selection. Surface rendering enters through wrapper slots, so
 * this module owns gesture mechanics without owning recursive traversal.
 *
 * Pointer and keyboard gestures share one measured layout resolver. Each
 * result identifies the actual destination parent and sibling gap; the same
 * result drives feedback and the eventual guarded move transaction.
 *
 * Pointer gestures use a fixed preview moved directly from the pointer.
 * Keyboard gestures publish a translated source rectangle for dnd-kit's
 * collision detector without loading its DOM feedback plugin.
 *
 * @module
 */
import { useContext, useLayoutEffect, useMemo, useState } from "react";
import { DragDropProvider } from "@dnd-kit/react";
import { Accessibility, AutoScroller, KeyboardSensor, PointerActivationConstraints, PointerSensor } from "@dnd-kit/dom";
import { SurfaceContext } from "../../surfaces/surface";
import { useEditorRoot, useReactEditor } from "../../hooks";
import { PageDragController } from "./controller";
import { PageDragOverlay } from "./preview/overlay";
import { createDropPlacementStore, PageDragStateContext } from "./state";
import { PageDragAutoScrollPolicy } from "./surface/auto-scroll";
import type { PageDragExtensionOptions } from "./types";
export type { PageDragExtensionOptions } from "./types";

const DRAG_PLUGINS = [Accessibility, AutoScroller];
/**
 * Viewport pixels one arrow press moves the keyboard stand-in rectangle.
 * Mirrors the legacy keyboard coordinate getter so existing row-stepping
 * expectations keep resolving to the same siblings.
 */
const KEYBOARD_STEP = 25;

/**
 * Provides structural block drag-and-drop for an outline surface.
 *
 * A selected sibling group moves together when the dragged block belongs to
 * it. Mixed-level selections safely fall back to the handle's single block.
 * Children remain owned by their roots and travel automatically. A block-body drop appends and uses
 * a highlight. A gap drop uses a horizontal line that follows the pointer
 * across every available depth. The resolved move is expressed relative to
 * the preceding block, one of its final ancestors, or its children. Dropping
 * onto the dragged subtree is ignored to prevent an ownership cycle.
 *
 * Grouped movement retains its whole-block selection; single movement replaces
 * any text or mixed selection with the moved block.
 *
 * @param props - Surface subtree and pointer/drop-zone configuration.
 * @returns A dnd-kit provider, shared drag state, source surface, and overlay.
 */
export function PageDragProvider({
  children,
  activationDistance = 4,
  childDropIndent = 24,
  gapDropZone = 8,
  outerEdgeDropZone,
  allowChildPlacement = true,
}: PageDragExtensionOptions) {
  const reactEditor = useReactEditor();
  const mode = useContext(SurfaceContext);
  const { element: root } = useEditorRoot();
  const [activeIds, setActiveIds] = useState<string[]>([]);
  const placements = useMemo(createDropPlacementStore, []);
  const controller = useMemo(() => new PageDragController(
    reactEditor, root, mode, placements, setActiveIds,
    { childDropIndent, gapDropZone, outerEdgeDropZone, allowChildPlacement },
  ), [reactEditor, root, mode, placements, childDropIndent, gapDropZone, outerEdgeDropZone, allowChildPlacement]);
  useLayoutEffect(() => controller.mount(), [controller]);
  // A plain sensor array replaces dnd-kit's defaults, so the keyboard sensor
  // is listed explicitly. Constraints are instantiated per activation because
  // each instance owns the controller of one pending gesture.
  const sensors = useMemo(() => [
    PointerSensor.configure({
      activationConstraints: () => [new PointerActivationConstraints.Distance({ value: activationDistance })],
    }),
    KeyboardSensor.configure({ offset: KEYBOARD_STEP }),
  ], [activationDistance]);
  const activeBlocks = activeIds.flatMap((id) => {
    const block = reactEditor.blocks.getBlock(id);
    return block ? [block] : [];
  });

  const dragContext = useMemo(() => ({ placements }), [placements]);

  return (
    <PageDragStateContext.Provider value={dragContext}>
      <DragDropProvider
        sensors={sensors}
        plugins={DRAG_PLUGINS}
        onDragStart={controller.handleDragStart}
        onDragMove={controller.handleDragMove}
        onDragEnd={controller.handleDragEnd}
      >
        <PageDragAutoScrollPolicy getPointer={controller.getDragPointer} />
        {children}
        <PageDragOverlay root={root} controller={controller} blocks={activeBlocks}
          childrenVisible={(block) => reactEditor.blockListProps.childrenVisible(block)} />
      </DragDropProvider>
    </PageDragStateContext.Provider>
  );
}
