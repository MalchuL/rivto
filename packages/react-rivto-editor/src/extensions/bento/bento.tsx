/**
 * Optional responsive Bento container for ordinary editor blocks. Width
 * preferences live in block props; content controls height. Tile widths are
 * previewed from left and right edges without reflowing the wrap layout, then
 * persisted once the pointer is released. Shared tree, keyboard and drag
 * extensions retain ownership of hierarchy, Enter, selection and transactions.
 *
 * @module
 */
import { createPortal } from "react-dom";
import {
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import type { EditorBlockInput } from "@chulane/rivto";
import { createCaretSelection } from "@chulane/rivto";
import { BlockElementRefProvider, type BlockWrapperProps } from "../../blocks/block-wrapper";
import { BlockModal, BlockModalButton } from "../../blocks/block-modal";
import { MarkdownContent } from "../../blocks/markdown";
import { BLOCK_ID_ATTRIBUTE } from "../../constants";
import { useReactEditor } from "../../hooks";
import { focusBlock, type ReactEditorExtension } from "../../managers";
import type { ReactEditor } from "../../types";

export const BENTO_BLOCK_TYPE = "bento";
const WIDTH_PROPERTY = "--rivto-bento-width";
const RESIZE_HANDLE_CLASS = "rivto-bento-resize";
const RESIZE_EDGE_ATTRIBUTE = "data-bento-resize-edge";
const RESIZING_TILE_ATTRIBUTE = "data-bento-resizing";
const RESIZING_HANDLE_ATTRIBUTE = "data-resizing";
const MIN_TILE_WIDTH = 160;
const MAX_TILE_WIDTH = 960;
const DEFAULT_TILE_WIDTH = 280;

/** Edge of a tile used as the resize origin. */
type BentoResizeEdge = "left" | "right";

/** Active pointer resize state retained without rerendering on every pixel. */
interface TileResizeGesture {
  readonly pointerId: number;
  readonly tile: HTMLElement;
  readonly edge: BentoResizeEdge;
  readonly startX: number;
  readonly startWidth: number;
  readonly frozen: readonly HTMLElement[];
  width: number;
}

/**
 * Converts persisted or requested width data to a safe CSS pixel value.
 *
 * @param value - Untrusted block property or caller value.
 * @returns Finite width clamped to the supported tile range.
 */
function tileWidth(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(MIN_TILE_WIDTH, Math.min(MAX_TILE_WIDTH, value))
    : DEFAULT_TILE_WIDTH;
}

/**
 * Locks every direct tile to its current rendered width so wrap and grow stay
 * still for one resize gesture.
 *
 * @param lane - Bento children container owning the tiles.
 * @returns Tiles whose inline flex basis must later be cleared.
 */
function freezeBentoTiles(lane: HTMLElement): HTMLElement[] {
  const tiles = [...lane.children].filter((child): child is HTMLElement => (
    child instanceof HTMLElement && child.hasAttribute(BLOCK_ID_ATTRIBUTE)
  ));
  for (const child of tiles) {
    const measured = child.offsetWidth;
    child.style.flex = "0 0 auto";
    child.style.width = `${measured}px`;
    child.style.minWidth = `${measured}px`;
    child.style.maxWidth = `${measured}px`;
  }
  return tiles;
}

/**
 * Paints a preview width on top of the frozen slot without changing siblings.
 *
 * Compensating margin keeps `width + margin` equal to the origin so the flex
 * line does not wrap. Overflow paints over neighbors while `z-index` lifts
 * the active tile.
 *
 * @param tile - Shell receiving the preview.
 * @param origin - In-flow width captured at pointer down.
 * @param preview - Clamped visual width following the pointer.
 * @param edge - Side the user is dragging.
 * @returns Nothing; styles are written directly to the tile.
 */
function previewBentoTile(
  tile: HTMLElement,
  origin: number,
  preview: number,
  edge: BentoResizeEdge,
): void {
  const compensation = origin - preview;
  tile.style.flex = "0 0 auto";
  tile.style.width = `${preview}px`;
  tile.style.minWidth = `${preview}px`;
  tile.style.maxWidth = "none";
  tile.style.marginLeft = edge === "left" ? `${compensation}px` : "0px";
  tile.style.marginRight = edge === "right" ? `${compensation}px` : "0px";
  tile.style.position = "relative";
  tile.style.zIndex = "8";
  tile.setAttribute(RESIZING_TILE_ATTRIBUTE, edge);
}

/**
 * Removes freeze and preview inline styles so CSS flex-basis can reflow.
 *
 * @param tiles - Shells previously locked by {@link freezeBentoTiles}.
 * @returns Nothing; every resize-owned inline style is cleared.
 */
function clearBentoResizeStyles(tiles: readonly HTMLElement[]): void {
  for (const tile of tiles) {
    tile.style.removeProperty("flex");
    tile.style.removeProperty("width");
    tile.style.removeProperty("min-width");
    tile.style.removeProperty("max-width");
    tile.style.removeProperty("position");
    tile.style.removeProperty("z-index");
    tile.style.removeProperty("margin-left");
    tile.style.removeProperty("margin-right");
    tile.removeAttribute(RESIZING_TILE_ATTRIBUTE);
  }
}

/**
 * Persists one preferred tile width through the ordinary block command.
 *
 * @param runtime - Active React editor runtime.
 * @param blockId - Tile whose `bentoWidth` should change.
 * @param width - Requested width in CSS pixels.
 * @returns Nothing; no-ops when the block is gone or the value is unchanged.
 */
function commitBentoTileWidth(runtime: ReactEditor, blockId: string, width: number): void {
  const block = runtime.editor.blocks.getBlock(blockId);
  const next = tileWidth(width);
  if (!block || tileWidth(block.props.bentoWidth) === next) return;
  runtime.blocks.updateBlock(blockId, { props: { ...block.props, bentoWidth: next } });
}

/**
 * Creates an empty grid ready for pasted, typed or dragged blocks.
 *
 * @returns Portable block input.
 */
export function createBentoBlockInput(): EditorBlockInput {
  return { type: BENTO_BLOCK_TYPE, content: "Bento" };
}

/**
 * Renders the editable title and identifies the grid's drop geometry.
 *
 * @param props - Container identity.
 * @param props.blockId - Stable ID of the Bento board.
 * @returns Editable title; the shared tree renders its tiles.
 */
export function Bento({ blockId }: { readonly blockId: string }) {
  const runtime = useReactEditor();
  return <div data-block-drop-container="" data-block-sort-children="grid" onKeyDownCapture={(event) => {
    if (event.key !== "Enter" || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing
      || runtime.editor.blocks.getBlock(blockId)?.children.length) return;
    event.preventDefault();
    event.stopPropagation();
    let id = "";
    runtime.editor.batchUpdates(() => {
      id = runtime.blocks.insertBlock(runtime.createDefaultBlock(), blockId);
      runtime.editor.blocks.moveBlocks([id], blockId, "inside");
      runtime.selection.set(createCaretSelection(id, 0));
    });
    requestAnimationFrame(() => { const root = runtime.events.getRoot(); if (root) focusBlock(root, id, 0); });
  }}><MarkdownContent blockId={blockId} /></div>;
}

/**
 * Left and right separators that preview width on the frozen tile, then commit.
 *
 * @param props - Tile identity and its mounted BlockView host.
 * @param props.blockId - Persisted tile ID receiving `bentoWidth`.
 * @param props.tile - Shell used for freeze, preview, and portal anchoring.
 * @returns Two accessible vertical resize handles.
 */
function BentoResizeHandles({ blockId, tile }: { readonly blockId: string; readonly tile: HTMLElement }) {
  const runtime = useReactEditor();
  const gesture = useRef<TileResizeGesture | null>(null);
  const width = tileWidth(runtime.editor.blocks.getBlock(blockId)?.props.bentoWidth);

  useLayoutEffect(() => () => {
    const active = gesture.current;
    if (!active) return;
    gesture.current = null;
    clearBentoResizeStyles(active.frozen);
  }, []);

  /**
   * Starts a pointer resize from one vertical edge without writing the document.
   *
   * @param edge - Side whose movement should grow or shrink the tile.
   * @returns Pointer-down handler bound to that edge.
   */
  const startResize = (edge: BentoResizeEdge) => (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const lane = tile.parentElement;
    if (!lane) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.setAttribute(RESIZING_HANDLE_ATTRIBUTE, "true");
    const frozen = freezeBentoTiles(lane);
    const startWidth = tile.offsetWidth;
    gesture.current = {
      pointerId: event.pointerId,
      tile,
      edge,
      startX: event.clientX,
      startWidth,
      frozen,
      width: startWidth,
    };
    previewBentoTile(tile, startWidth, startWidth, edge);
  };

  /**
   * Follows the pointer with a local preview. Sibling flex slots stay frozen.
   *
   * @param event - Captured pointer movement.
   * @returns Nothing; the final width is retained on the active gesture.
   */
  const previewResize = (event: PointerEvent<HTMLDivElement>) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    const delta = active.edge === "right"
      ? event.clientX - active.startX
      : active.startX - event.clientX;
    active.width = tileWidth(active.startWidth + delta);
    previewBentoTile(active.tile, active.startWidth, active.width, active.edge);
  };

  /**
   * Ends capture, restores frozen siblings, and optionally persists the width.
   *
   * @param event - Pointer release or cancellation.
   * @param commit - Whether to save rather than discard the preview.
   * @returns Nothing; the active gesture is cleared.
   */
  const finishResize = (event: PointerEvent<HTMLDivElement>, commit: boolean) => {
    const active = gesture.current;
    if (!active || active.pointerId !== event.pointerId) return;
    gesture.current = null;
    event.currentTarget.removeAttribute(RESIZING_HANDLE_ATTRIBUTE);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const widthToWrite = commit ? active.width : active.startWidth;
    clearBentoResizeStyles(active.frozen);
    if (commit) commitBentoTileWidth(runtime, blockId, widthToWrite);
  };

  /**
   * Offers keyboard resizing on the same accessible vertical separator.
   *
   * @param edge - Side that owns the focused handle.
   * @returns Key handler that persists one adjustment per arrow press.
   */
  const resizeWithKeyboard = (edge: BentoResizeEdge) => (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const towardRight = event.key === "ArrowRight";
    const direction = edge === "right" ? (towardRight ? 1 : -1) : (towardRight ? -1 : 1);
    const step = event.shiftKey ? 50 : 10;
    commitBentoTileWidth(runtime, blockId, width + direction * step);
  };

  /**
   * Builds one edge separator portaled onto the tile shell.
   *
   * @param edge - Left or right resize origin.
   * @returns Accessible separator bound to the shared gesture.
   */
  const handle = (edge: BentoResizeEdge) => (
    <div
      className={RESIZE_HANDLE_CLASS}
      role="separator"
      tabIndex={0}
      aria-label={edge === "left" ? "Resize Bento tile from the left" : "Resize Bento tile from the right"}
      aria-orientation="vertical"
      aria-valuemin={MIN_TILE_WIDTH}
      aria-valuemax={MAX_TILE_WIDTH}
      aria-valuenow={width}
      {...{ [RESIZE_EDGE_ATTRIBUTE]: edge }}
      onPointerDown={startResize(edge)}
      onPointerMove={previewResize}
      onPointerUp={(event) => finishResize(event, true)}
      onPointerCancel={(event) => finishResize(event, false)}
      onKeyDown={resizeWithKeyboard(edge)}
    />
  );

  return <>
    {handle("left")}
    {handle("right")}
  </>;
}

/**
 * Applies persisted preferred widths to Bento tiles and hosts edge handles.
 *
 * @param props - Block snapshot and remaining wrapper chain.
 * @returns Expandable board, a width-aware tile, or the unchanged subtree.
 */
function BentoWrapper({ block, children }: BlockWrapperProps) {
  const runtime = useReactEditor();
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const parentId = runtime.editor.blocks.getParentId(block.id);
  const isBoard = block.type === BENTO_BLOCK_TYPE;
  const isTile = !isBoard
    && typeof parentId === "string"
    && runtime.editor.blocks.getBlock(parentId)?.type === BENTO_BLOCK_TYPE;
  const width = tileWidth(block.props.bentoWidth);

  useLayoutEffect(() => {
    if (!isTile) return;
    element?.style.setProperty(WIDTH_PROPERTY, `${width}px`);
    return () => { element?.style.removeProperty(WIDTH_PROPERTY); };
  }, [element, isTile, width]);

  const subtree = isTile
    ? <BlockElementRefProvider elementRef={setElement}>{children}</BlockElementRefProvider>
    : children;
  const withHandles = isTile && element
    ? <>
      {subtree}
      {createPortal(<BentoResizeHandles blockId={block.id} tile={element} />, element)}
    </>
    : subtree;
  return isBoard ? <BlockModal label="Bento">{children}</BlockModal> : withHandles;
}

/**
 * Registers optional Bento presentation and insertion in both editor surfaces.
 *
 * @returns Extension with reversible runtime registrations.
 */
export function bentoExtension(): ReactEditorExtension {
  return {
    id: "block.bento",
    setup: (runtime) => {
      const disposers = [
        runtime.blocks.register({ definition: { type: BENTO_BLOCK_TYPE, title: "Bento" }, render: Bento }),
        runtime.surfaces.registerBlockWrapper("block", BentoWrapper),
        runtime.surfaces.registerBlockWrapper("edgeless", BentoWrapper),
        runtime.surfaces.registerBlockSlot({
          position: "right",
          component: BlockModalButton,
          when: ({ block }) => block.type === BENTO_BLOCK_TYPE,
        }),
        runtime.slashCommands.register({
          id: "block.bento.insert",
          title: "Bento",
          group: "Insert",
          keywords: ["grid", "tiles"],
          execute: ({ blockId }) => { runtime.blocks.insertBlock(createBentoBlockInput(), blockId); },
        }),
      ];
      return () => disposers.reverse().forEach((dispose) => dispose());
    },
  };
}
