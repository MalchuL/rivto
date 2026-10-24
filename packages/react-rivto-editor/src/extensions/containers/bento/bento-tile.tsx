import { BlockDropWrapper, type BlockChildrenItemProps } from "@chulane/rivto-page";
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { useBlockNode, useReactPanel } from "../../../hooks";
import { editorControlProps } from "../../../constants";
import { BentoResizeController } from "./bento-resize-controller";
import {
  BENTO_WIDTH_PROPERTY,
  BENTO_TILE_ITEM_CLASS,
  MIN_TILE_WIDTH,
  MAX_TILE_WIDTH,
  RESIZE_EDGE_ATTRIBUTE,
} from "./bento-constants";

/** Width is a placement property; the existing child block retains its own layout. */
interface BentoTilePlacementStyle extends CSSProperties {
  readonly [BENTO_WIDTH_PROPERTY]: string;
}
const RESIZE_HANDLE_CLASS = "rivto-bento-resize";

/**
 * Owns a tile's width and resize controls without borrowing the nested block's DOM ref.
 *
 * Page supplies the block exactly once. The existing resize gesture uses this
 * explicit item as its frozen placement and preview surface, including cleanup.
 * A declared trailing content edge explicitly appends children alongside the
 * shell's content-inside region. Placement edges retain priority, while resize
 * and other controls keep their native interaction. An active block drag may use
 * their containing region unless the layout explicitly excludes that subtree.
 *
 * @param props - Persisted tile identity and the already-rendered Page shell.
 * @param props.blockId - Block whose preferred width is observed.
 * @param props.children - Page shell and its descendants, rendered exactly once.
 * @returns A width-aware item with left and right resize handles after attachment.
 */
export function BentoTileItem({ blockId, children }: BlockChildrenItemProps) {
  const { block } = useBlockNode(blockId);
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const style: BentoTilePlacementStyle = {
    [BENTO_WIDTH_PROPERTY]: `${BentoResizeController.getWidth(block?.props.bentoWidth)}px`,
  };
  return (
    <BlockDropWrapper
      className={BENTO_TILE_ITEM_CLASS}
      ref={setElement}
      style={style}
      contentRegions={[
        {
          kind: "edge",
          side: "block-end",
          size: 4,
          indicatorInset: 8,
          destination: { kind: "inside", parentId: blockId },
        },
      ]}
    >
      {children}
      {element && <BentoResizeHandles blockId={blockId} tile={element} />}
    </BlockDropWrapper>
  );
}

/** Mounted placement borrowed by the resize controls for one tile. */
interface BentoResizeHandlesProps {
  readonly blockId: string;
  readonly tile: HTMLElement;
}

/**
 * Left and right separators that preview width on the frozen tile, then commit.
 *
 * @param props - Tile identity and its mounted block shell host.
 * @param props.blockId - Persisted tile ID receiving `bentoWidth`.
 * @param props.tile - Shell used for freeze, preview, and portal anchoring.
 * @returns Two accessible vertical resize handles.
 */
function BentoResizeHandles({ blockId, tile }: BentoResizeHandlesProps) {
  const reactPanel = useReactPanel();
  const controller = useRef<BentoResizeController | null>(null);
  const width = BentoResizeController.getWidth(
    reactPanel.blocks.getBlockNode(blockId)?.props.bentoWidth,
  );
  useLayoutEffect(() => {
    const resize = new BentoResizeController(reactPanel.blocks, blockId, tile);
    controller.current = resize;
    return () => {
      controller.current = null;
      resize.cancel();
    };
  }, [reactPanel.blocks, blockId, tile]);

  return (
    <>
      {(["left", "right"] as const).map((edge) => (
        <div
          key={edge}
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
          onPointerDown={(event) =>
            controller.current?.start(edge, event.nativeEvent, event.currentTarget)
          }
          onPointerMove={(event) => controller.current?.move(event.nativeEvent)}
          onPointerUp={(event) => controller.current?.finish(event.nativeEvent, true)}
          onPointerCancel={(event) => controller.current?.finish(event.nativeEvent, false)}
          onLostPointerCapture={(event) => controller.current?.finish(event.nativeEvent, false)}
          onKeyDown={(event) => controller.current?.resizeWithKeyboard(edge, event.nativeEvent)}
        />
      ))}
    </>
  );
}
