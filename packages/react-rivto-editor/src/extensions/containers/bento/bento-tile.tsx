import { BlockDropWrapper, type BlockChildrenItemProps } from "@chulane/rivto-page";
import { useState, type CSSProperties } from "react";
import { useBlockNode } from "../../../hooks";
import { isBlockStyle } from "../../../blocks/style/block-style";
import { BlockResizeHandles } from "../block-resize/block-resize-handles";
import { MAX_RESIZE_WIDTH } from "../block-resize/block-resize-constants";
import { normalizeResizeWidth } from "../block-resize/block-resize-size";
import {
  BENTO_WIDTH_PROPERTY,
  BENTO_MAX_WIDTH_PROPERTY,
  BENTO_TILE_ITEM_CLASS,
  BENTO_WIDTH_PLUGIN_ID,
  BENTO_ORIGINAL_WIDTH_PLUGIN_ID,
  BENTO_HEIGHT_PLUGIN_ID,
  BENTO_ORIGINAL_HEIGHT_PLUGIN_ID,
} from "./bento-constants";

/** Width is a placement property; the existing child block retains its own layout. */
interface BentoTilePlacementStyle extends CSSProperties {
  readonly [BENTO_WIDTH_PROPERTY]: string;
  readonly [BENTO_MAX_WIDTH_PROPERTY]: string;
}

/**
 * Owns a tile's width and resize controls without borrowing the nested block's DOM ref.
 *
 * Page supplies the block exactly once. The existing resize gesture uses this
 * explicit item as its frozen placement and preview surface, including cleanup.
 * Vertical previews target the existing child shell because the surrounding
 * placement also includes the grid's insertion gutter.
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
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const storedStyle = block?.listProps.style;
  const width = block?.pluginData[BENTO_WIDTH_PLUGIN_ID];
  const widthPolicy = isBlockStyle(storedStyle) ? storedStyle.size?.widthPolicy : undefined;
  const validWidth = typeof width === "number" && Number.isFinite(width);
  const style: BentoTilePlacementStyle = {
    [BENTO_WIDTH_PROPERTY]: `${normalizeResizeWidth(width)}px`,
    [BENTO_MAX_WIDTH_PROPERTY]: `${MAX_RESIZE_WIDTH}px`,
  };
  return (
    <BlockDropWrapper
      className={BENTO_TILE_ITEM_CLASS}
      ref={setElement}
      style={style}
      data-width-policy={validWidth && widthPolicy === "grow" ? "grow" : undefined}
    >
      {children}
      {element && (
        <BlockResizeHandles
          blockId={blockId}
          placement={element}
          heightTarget={
            element.querySelector<HTMLElement>(
              ":scope > .rivto-block-drop-wrapper-content > .rivto-block",
            ) ?? undefined
          }
          style={storedStyle}
          pluginId={BENTO_WIDTH_PLUGIN_ID}
          originalWidthPluginId={BENTO_ORIGINAL_WIDTH_PLUGIN_ID}
          heightPluginId={BENTO_HEIGHT_PLUGIN_ID}
          originalHeightPluginId={BENTO_ORIGINAL_HEIGHT_PLUGIN_ID}
          edges={["left", "right", "bottom", "bottom-right"]}
          pluginWidth={width}
          label="Bento tile"
        />
      )}
    </BlockDropWrapper>
  );
}
