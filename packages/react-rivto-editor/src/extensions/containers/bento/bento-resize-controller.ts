import type { ReactPanelApi } from "../../../panels/types";
import { BLOCK_ID_ATTRIBUTE } from "../../../constants";
import {
  BENTO_TILE_ITEM_CLASS,
  MIN_TILE_WIDTH,
  MAX_TILE_WIDTH,
  RESIZING_HANDLE_ATTRIBUTE,
  RESIZING_TILE_ATTRIBUTE,
} from "./bento-constants";

/** Edge of a tile used as the resize origin. */
export type BentoResizeEdge = "left" | "right";

/** Inline properties temporarily owned by a resize; other live styles stay untouched. */
const RESIZE_PROPERTIES = [
  "flex",
  "width",
  "min-width",
  "max-width",
  "position",
  "z-index",
  "margin-left",
  "margin-right",
] as const;

/** Saved inline declaration, including the priority restored after a gesture. */
interface TileInlineStyle {
  readonly name: string;
  readonly value: string;
  readonly priority: string;
}

/** One measured placement and the inline declarations restored when its gesture ends. */
interface FrozenTile {
  readonly element: HTMLElement;
  readonly width: number;
  readonly styles: readonly TileInlineStyle[];
}

/** Active pointer resize state retained without rerendering on every pixel. */
interface TileResizeGesture {
  readonly pointerId: number;
  readonly handle: HTMLElement;
  readonly edge: BentoResizeEdge;
  readonly startX: number;
  readonly startWidth: number;
  readonly frozen: readonly FrozenTile[];
  width: number;
}

/** Owns one tile's preview, pointer capture and cancellation resources. */
export class BentoResizeController {
  private gesture: TileResizeGesture | undefined;

  /**
   * Borrows only addressed reads and ordinary width commands from the panel.
   *
   * The mounted handle component owns this controller and cancels it on detach.
   * No document write occurs until pointer release or an explicit arrow-key adjustment.
   *
   * @param blocks - Live block reads and mutation commands; lifecycle remains with the panel.
   * @param blockId - Persisted tile identity receiving bentoWidth.
   * @param tile - Explicit Page placement or retained Edgeless block shell.
   */
  constructor(
    private readonly blocks: Pick<ReactPanelApi["blocks"], "getBlockNode" | "updateBlock">,
    private readonly blockId: string,
    private readonly tile: HTMLElement,
  ) {}

  /**
   * Converts persisted or requested width data to a safe CSS pixel value.
   *
   * @param value - Untrusted block property or caller value.
   * @returns Finite width clamped to the supported tile range; invalid values use 280 pixels.
   */
  static getWidth(value: unknown): number {
    return typeof value === "number" && Number.isFinite(value)
      ? Math.max(MIN_TILE_WIDTH, Math.min(MAX_TILE_WIDTH, value))
      : 280;
  }

  /**
   * Starts a pointer resize from one vertical edge without writing the document.
   *
   * All sibling widths are read before any layout writes. Capture and window
   * cancellation listeners belong to this gesture and are rolled back on failure.
   *
   * @param edge - Side whose movement should grow or shrink the tile.
   * @param event - Primary-button pointer down delivered by the owning handle.
   * @param handle - Actual separator receiving pointer capture and active feedback.
   * @returns The siblings are frozen and one local preview is active, or no change for another button.
   * @throws Propagates browser capture failures after rolling back acquired resources.
   */
  start(edge: BentoResizeEdge, event: PointerEvent, handle: HTMLElement): void {
    const lane = this.tile.parentElement;
    if (event.button !== 0 || !lane) {
      return;
    }
    this.cancel();
    event.preventDefault();
    event.stopPropagation();
    const frozen = this.measureTiles(lane);
    const startWidth =
      frozen.find(({ element }) => element === this.tile)?.width ?? this.tile.offsetWidth;
    this.gesture = {
      pointerId: event.pointerId,
      handle,
      edge,
      startX: event.clientX,
      startWidth,
      frozen,
      width: startWidth,
    };
    try {
      this.freezeTiles(frozen);
      handle.setPointerCapture(event.pointerId);
      handle.setAttribute(RESIZING_HANDLE_ATTRIBUTE, "true");
      const view = this.tile.ownerDocument.defaultView;
      view?.addEventListener("blur", this.cancel);
      view?.addEventListener("keydown", this.cancelOnEscape, true);
      this.previewTile(startWidth, startWidth, edge);
    } catch (error) {
      try {
        this.cancel();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Bento resize setup and cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Follows the pointer with a local preview while sibling flex slots stay frozen.
   *
   * @param event - Captured pointer movement; other pointer identities are ignored.
   * @returns The final width is retained on the gesture without a model write or layout read.
   */
  move(event: PointerEvent): void {
    const active = this.gesture;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    const delta =
      active.edge === "right" ? event.clientX - active.startX : active.startX - event.clientX;
    active.width = BentoResizeController.getWidth(active.startWidth + delta);
    this.previewTile(active.startWidth, active.width, active.edge);
  }

  /**
   * Ends capture, restores frozen siblings and optionally persists the final pointer width.
   *
   * @param event - Pointer release, cancellation or lost capture.
   * @param commit - Whether to save rather than discard the preview.
   * @returns The matching gesture is cleared; cancelled and unrelated pointers never write.
   * @throws Propagates cleanup or block-command failures.
   */
  finish(event: PointerEvent, commit: boolean): void {
    const active = this.gesture;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    if (commit) {
      this.move(event);
    }
    this.cancel();
    if (commit) {
      this.commitWidth(active.width);
    }
  }

  /**
   * Offers keyboard resizing on the same accessible vertical separator.
   *
   * Each arrow reads the latest model width, so repeated keys do not reuse a stale render.
   *
   * @param edge - Side that owns the focused handle.
   * @param event - Arrow key event; Shift changes the step from 10 to 50 CSS pixels.
   * @returns One adjustment is committed for a supported arrow; other keys retain their behavior.
   * @throws Propagates delegated block-command failures.
   */
  resizeWithKeyboard(edge: BentoResizeEdge, event: KeyboardEvent): void {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    const direction = (edge === "right") === (event.key === "ArrowRight") ? 1 : -1;
    const step = event.shiftKey ? 50 : 10;
    const width = BentoResizeController.getWidth(
      this.blocks.getBlockNode(this.blockId)?.props.bentoWidth,
    );
    this.commitWidth(width + direction * step);
  }

  /**
   * Restores resize-owned styles, releases capture and removes window listeners.
   *
   * Called on Escape, blur, pointer cancellation, replacement and component detach.
   * The model is never changed; unrelated inline styles written during the gesture survive.
   *
   * @returns Every retained resource has been offered cleanup; repeated calls do nothing.
   * @throws Aggregates browser cleanup failures after attempting all remaining resources.
   */
  readonly cancel = (): void => {
    const active = this.gesture;
    if (!active) {
      return;
    }
    this.gesture = undefined;
    const view = this.tile.ownerDocument.defaultView;
    view?.removeEventListener("blur", this.cancel);
    view?.removeEventListener("keydown", this.cancelOnEscape, true);
    active.handle.removeAttribute(RESIZING_HANDLE_ATTRIBUTE);
    const errors: unknown[] = [];
    for (const frozen of active.frozen) {
      try {
        for (const { name, value, priority } of frozen.styles) {
          frozen.element.style.setProperty(name, value, priority);
        }
        frozen.element.removeAttribute(RESIZING_TILE_ATTRIBUTE);
      } catch (error) {
        errors.push(error);
      }
    }
    try {
      if (active.handle.hasPointerCapture(active.pointerId)) {
        active.handle.releasePointerCapture(active.pointerId);
      }
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, "Bento resize cleanup failed");
    }
  };

  /**
   * Locks every direct tile to its current rendered width so wrap and grow stay
   * still for one resize gesture.
   *
   * @param lane - Bento children container owning the tiles.
   * @returns Measured tiles and saved declarations; no styles have been written yet.
   */
  private measureTiles(lane: HTMLElement): FrozenTile[] {
    const tiles: FrozenTile[] = [];
    for (const child of lane.children) {
      if (
        !(child instanceof this.tile.ownerDocument.defaultView!.HTMLElement) ||
        (!child.hasAttribute(BLOCK_ID_ATTRIBUTE) &&
          !child.classList.contains(BENTO_TILE_ITEM_CLASS))
      ) {
        continue;
      }
      tiles.push({
        element: child,
        width: child.offsetWidth,
        styles: RESIZE_PROPERTIES.map((name) => ({
          name,
          value: child.style.getPropertyValue(name),
          priority: child.style.getPropertyPriority(name),
        })),
      });
    }
    return tiles;
  }

  /**
   * Applies previously measured flex slots without alternating geometry reads and writes.
   *
   * @param tiles - All direct tile measurements captured before freezing begins.
   * @returns Every tile retains its original slot width until the gesture ends.
   */
  private freezeTiles(tiles: readonly FrozenTile[]): void {
    for (const { element, width } of tiles) {
      element.style.flex = "0 0 auto";
      element.style.width = `${width}px`;
      element.style.minWidth = `${width}px`;
      element.style.maxWidth = `${width}px`;
    }
  }

  /**
   * Paints a preview width on top of the frozen slot without changing siblings.
   *
   * Compensating margin keeps width plus margin equal to the origin so the flex
   * line does not wrap. Overflow paints over neighbors while z-index lifts
   * the active tile.
   *
   * @param origin - In-flow width captured at pointer down.
   * @param preview - Clamped visual width following the pointer.
   * @param edge - Side the user is dragging.
   * @returns Styles are written directly to the owned tile, without document mutation.
   */
  private previewTile(origin: number, preview: number, edge: BentoResizeEdge): void {
    const tile = this.tile;
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
   * Persists one preferred tile width through the ordinary block command.
   *
   * @param width - Requested width in CSS pixels for the controller's persisted tile.
   * @returns No model change when the block is gone or its current value is unchanged.
   * @throws Propagates delegated command failures.
   */
  private commitWidth(width: number): void {
    const block = this.blocks.getBlockNode(this.blockId);
    const next = BentoResizeController.getWidth(width);
    if (!block || BentoResizeController.getWidth(block.props.bentoWidth) === next) {
      return;
    }
    this.blocks.updateBlock(this.blockId, { props: { ...block.props, bentoWidth: next } });
  }

  /**
   * Cancels the active resize before Escape can dismiss its surrounding modal.
   *
   * @param event - Captured window key event.
   * @returns Escape consumes the gesture; unrelated keys retain native delivery.
   * @throws Propagates cleanup failures after attempting all owned resources.
   */
  private readonly cancelOnEscape = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      this.cancel();
    }
  };
}
