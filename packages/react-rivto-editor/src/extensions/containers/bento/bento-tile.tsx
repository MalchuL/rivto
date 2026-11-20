import { BlockDropWrapper, type BlockChildrenItemProps } from "@chulane/rivto-page";
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RegionIdentity } from "@chulane/rivto-root";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { useBlockNode } from "../../../hooks";
import { useReactPanelContext } from "../../../hooks/editor/use-react-panel-context";
import { editorControlProps } from "../../../constants";
import { BentoResizeController } from "./bento-resize-controller";
import type {
  BentoResizeHandleProps,
  BentoResizeHandlesProps,
  BentoTilePlacementStyle,
} from "./types";
import { attachBentoResizeInput } from "./browser/bento-resize-input";
import {
  BENTO_WIDTH_PROPERTY,
  BENTO_TILE_ITEM_CLASS,
  MIN_TILE_WIDTH,
  MAX_TILE_WIDTH,
  RESIZE_EDGE_ATTRIBUTE,
} from "./bento-constants";

const RESIZE_HANDLE_CLASS = "rivto-bento-resize";

/**
 * Owns a tile's width and resize controls without borrowing the nested block's DOM ref.
 *
 * Page supplies the block exactly once. The existing resize gesture uses this
 * explicit item as its frozen placement and preview surface, including cleanup.
 * The shell's content-inside region and indented block-end boundaries both
 * accept nesting through Page's shared outline placement. Inline seams retain
 * sibling insertion, while resize and other controls keep their native interaction.
 * An active block drag may use their containing region unless the layout
 * explicitly excludes that subtree.
 *
 * @param props - Persisted tile identity and the already-rendered Page shell.
 * @param props.blockId - Block whose preferred width is observed.
 * @param props.children - Page shell and its descendants, rendered exactly once.
 * @returns A width-aware item with left and right resize handles after attachment.
 */
export function BentoTileItem({ blockId, children }: BlockChildrenItemProps) {
  const { block } = useBlockNode(blockId);
  const [mounted, setMounted] = useState(false);
  /**
   * Tracks whether the tile's placement is mounted without retaining its element.
   *
   * @param identity - Current placement identity, or null after unmount.
   * @returns Resize handles are scheduled to match placement availability.
   */
  const setPlacement = useCallback((identity: RegionIdentity | null) => {
    setMounted(identity !== null);
  }, []);
  const style: BentoTilePlacementStyle = {
    [BENTO_WIDTH_PROPERTY]: `${BentoResizeController.getWidth(block?.props.bentoWidth)}px`,
  };
  return (
    <BlockDropWrapper className={BENTO_TILE_ITEM_CLASS} ref={setPlacement} style={style}>
      {children}
      {mounted && <BentoResizeHandles blockId={blockId} />}
    </BlockDropWrapper>
  );
}

/**
 * Left and right separators that preview width on the frozen tile, then commit.
 *
 * @param props - Tile identity for the mounted block shell.
 * @param props.blockId - Persisted tile ID receiving `bentoWidth`.
 * @returns Two accessible vertical resize handles.
 */
function BentoResizeHandles({ blockId }: BentoResizeHandlesProps) {
  const { reactPanel } = useReactPanelContext();
  const controller = useMemo(
    () => new BentoResizeController(reactPanel.blocks, blockId),
    [reactPanel.blocks, blockId],
  );
  const width = BentoResizeController.getWidth(
    reactPanel.blocks.getBlockNode(blockId)?.props.bentoWidth,
  );
  useLayoutEffect(() => {
    return () => controller.cancel();
  }, [controller]);

  return (
    <>
      {(["left", "right"] as const).map((edge) => (
        <BentoResizeHandle
          key={edge}
          edge={edge}
          width={width}
          controller={controller}
          panel={reactPanel}
        />
      ))}
    </>
  );
}

/**
 * Attaches normalized input to one accessible resize separator.
 *
 * @param props - Edge, current width and shared tile gesture owner.
 * @param props.edge - Side controlled by this separator.
 * @param props.width - Current persisted width in CSS pixels.
 * @param props.controller - Shared gesture owner, retained by the parent.
 * @param props.panel - Borrowed panel occurrence and availability subscription.
 * @returns A mounted separator whose listener attachment ends on unmount.
 * @throws If listener attachment or cleanup fails.
 */
function BentoResizeHandle({ edge, width, controller, panel }: BentoResizeHandleProps) {
  const handle = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (handle.current) {
      return attachBentoResizeInput(
        getBrowserElementIdentity(handle.current),
        edge,
        controller,
        panel,
      );
    }
  }, [edge, controller, panel]);
  return (
    <div
      ref={handle}
      {...editorControlProps}
      className={RESIZE_HANDLE_CLASS}
      role="separator"
      tabIndex={0}
      aria-label={
        edge === "left" ? "Resize Bento tile from the left" : "Resize Bento tile from the right"
      }
      aria-orientation="vertical"
      aria-valuemin={MIN_TILE_WIDTH}
      aria-valuemax={MAX_TILE_WIDTH}
      aria-valuenow={width}
      {...{ [RESIZE_EDGE_ATTRIBUTE]: edge }}
    />
  );
}
