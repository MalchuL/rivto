import type { ReactPanelApi } from "../../../panels/types";
import type { InputRegion, KeyInput, PointerInput } from "@chulane/rivto-root";
import type { BentoResizeEdge, BentoResizeStart, FrozenTile, TileResizeGesture } from "./types";
import { BLOCK_ID_ATTRIBUTE } from "../../../constants";
import {
  BENTO_TILE_ITEM_CLASS,
  MIN_TILE_WIDTH,
  MAX_TILE_WIDTH,
  RESIZING_HANDLE_ATTRIBUTE,
  RESIZING_TILE_ATTRIBUTE,
  RESIZE_EDGE_ATTRIBUTE,
} from "./bento-constants";

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
   */
  constructor(
    private readonly blocks: Pick<ReactPanelApi["blocks"], "getBlockNode" | "updateBlock">,
    private readonly blockId: string,
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
   * @param event - Normalized primary-button pointer down delivered by the owning handle.
   * @param input - Separator feedback and cancellation capabilities borrowed for this gesture.
   * @returns The siblings are frozen and one local preview is active, or no change for another button or a detached input.
   * @throws Propagates browser capture failures after rolling back acquired resources.
   */
  start(
    edge: BentoResizeEdge,
    event: Pick<
      PointerInput,
      | "button"
      | "pointerId"
      | "clientX"
      | "preventDefault"
      | "stopPropagation"
      | "captureTargetPointer"
    >,
    input: BentoResizeStart,
  ): void {
    const placement = input.placement;
    if (event.button !== 0 || !placement) {
      return;
    }
    this.cancel();
    event.preventDefault();
    event.stopPropagation();
    const frozen = this.measureTiles(placement.lane);
    const tile = this.findTile(frozen, placement.tile);
    if (!tile) {
      this.restoreTiles(frozen);
      return;
    }
    const startWidth = tile.width;
    const gesture: TileResizeGesture = {
      pointerId: event.pointerId,
      edge,
      startX: event.clientX,
      startWidth,
      frozen,
      tile,
      width: startWidth,
    };
    this.gesture = gesture;
    this.activateGesture(gesture, event, input);
  }

  /**
   * Follows the pointer with a local preview while sibling flex slots stay frozen.
   *
   * @param event - Normalized captured pointer movement; other pointer identities are ignored.
   * @returns The final width is retained on the gesture without a model write or layout read.
   */
  move(event: Pick<PointerInput, "pointerId" | "clientX">): void {
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
   * @param event - Normalized pointer release, cancellation or lost capture.
   * @param commit - Whether to save rather than discard the preview.
   * @returns The matching gesture is cleared; cancelled and unrelated pointers never write.
   * @throws Propagates cleanup or block-command failures.
   */
  finish(event: Pick<PointerInput, "pointerId" | "clientX">, commit: boolean): void {
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
   * @param event - Normalized arrow key input; Shift changes the step from 10 to 50 CSS pixels.
   * @returns One adjustment is committed for a supported arrow; other keys retain their behavior.
   * @throws Propagates delegated block-command failures.
   */
  resizeWithKeyboard(
    edge: BentoResizeEdge,
    event: Pick<KeyInput, "key" | "shiftKey" | "preventDefault" | "stopPropagation">,
  ): void {
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
    const errors: unknown[] = [];
    try {
      active.releaseListeners?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      active.releaseFeedback?.();
    } catch (error) {
      errors.push(error);
    }
    try {
      this.restoreTiles(active.frozen);
    } catch (error) {
      errors.push(error);
    }
    try {
      active.releasePointer?.();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, "Bento resize cleanup failed");
    }
  };

  /**
   * Acquires capture, feedback and cancellation for the staged resize gesture.
   *
   * @param gesture - Active gesture whose sibling styles have been captured.
   * @param event - Pointer providing capture for the gesture.
   * @param input - Handle feedback and cancellation registrations.
   * @returns Acquired resources are retained until cancellation or release.
   * @throws Propagates setup failures after attempting gesture cleanup.
   */
  private activateGesture(
    gesture: TileResizeGesture,
    event: Pick<PointerInput, "captureTargetPointer">,
    input: BentoResizeStart,
  ): void {
    try {
      this.freezeTiles(gesture.frozen);
      const releasePointer = event.captureTargetPointer(`[${RESIZE_EDGE_ATTRIBUTE}]`);
      if (this.gesture !== gesture) {
        releasePointer?.();
        return;
      }
      if (!releasePointer) {
        this.cancel();
        return;
      }
      gesture.releasePointer = releasePointer;
      const releaseFeedback = input.feedback.setTemporaryAttribute(
        RESIZING_HANDLE_ATTRIBUTE,
        "true",
      );
      if (this.gesture !== gesture) {
        releaseFeedback();
        return;
      }
      gesture.releaseFeedback = releaseFeedback;
      const releaseListeners = input.subscribeCancellation(this.cancel);
      if (this.gesture !== gesture) {
        releaseListeners();
        return;
      }
      gesture.releaseListeners = releaseListeners;
      this.previewTile(gesture.startWidth, gesture.startWidth, gesture.edge);
    } catch (error) {
      try {
        if (this.gesture === gesture) {
          this.cancel();
        }
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Bento resize setup and cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Finds the active tile and releases captured styles if the ownership check fails.
   *
   * @param tiles - Measured tiles with captured style sessions.
   * @param region - Placement selected by the resize handle.
   * @returns The matching tile, or undefined when it is no longer present.
   * @throws Propagates ownership failures, including failed style cleanup.
   */
  private findTile(tiles: readonly FrozenTile[], region: InputRegion): FrozenTile | undefined {
    try {
      return tiles.find((tile) => tile.region.isSame(region));
    } catch (error) {
      try {
        this.restoreTiles(tiles);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Bento tile lookup and cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Locks every direct tile to its current rendered width so wrap and grow stay
   * still for one resize gesture.
   *
   * @param lane - Bento children container owning the tiles.
   * @returns Measured tiles and saved declarations; no styles have been written yet.
   */
  private measureTiles(lane: InputRegion): FrozenTile[] {
    const children = lane.captureChildren();
    const count = children?.getLength();
    if (count === undefined) {
      return [];
    }
    const measured: FrozenTile[] = [];
    try {
      for (let index = 0; index < count; index++) {
        const region = children?.get(index);
        if (!region?.matches(`[${BLOCK_ID_ATTRIBUTE}], .${BENTO_TILE_ITEM_CLASS}`)) {
          continue;
        }
        const width = region.readLayoutWidth();
        if (width === undefined) {
          throw new Error("Bento tile became unavailable during measurement");
        }
        measured.push({ region, width, styles: [] });
      }
      for (const tile of measured) {
        for (const name of RESIZE_PROPERTIES) {
          const session = tile.region.captureInlineStyle(name);
          if (!session) {
            throw new Error("Bento tile became unavailable during style capture");
          }
          tile.styles.push({ name, session });
        }
      }
      return measured;
    } catch (error) {
      try {
        this.restoreTiles(measured);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Bento measurement and cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Locks every direct tile to its current rendered width so wrap and grow stay
   * still for one resize gesture.
   *
   * @param tiles - All direct tile measurements captured before freezing begins.
   * @returns Every tile retains its original slot width until the gesture ends.
   */
  private freezeTiles(tiles: readonly FrozenTile[]): void {
    for (const tile of tiles) {
      this.setTileStyles(tile, {
        flex: "0 0 auto",
        width: `${tile.width}px`,
        "min-width": `${tile.width}px`,
        "max-width": `${tile.width}px`,
      });
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
    const tile = this.gesture?.tile;
    if (!tile) {
      return;
    }
    const compensation = origin - preview;
    this.setTileStyles(tile, {
      flex: "0 0 auto",
      width: `${preview}px`,
      "min-width": `${preview}px`,
      "max-width": "none",
      "margin-left": edge === "left" ? `${compensation}px` : "0px",
      "margin-right": edge === "right" ? `${compensation}px` : "0px",
      position: "relative",
      "z-index": "8",
    });
    if (!tile.releaseMarker) {
      const release = tile.region.setTemporaryAttribute(RESIZING_TILE_ATTRIBUTE, edge);
      if (this.gesture?.tile !== tile) {
        release();
        return;
      }
      tile.releaseMarker = release;
    }
  }

  /**
   * Writes only properties captured by the tile's gesture.
   *
   * @param tile - Tile with captured inline style sessions.
   * @param values - CSS declarations to update.
   * @returns Available declarations have been updated.
   */
  private setTileStyles(tile: FrozenTile, values: Readonly<Record<string, string>>): void {
    for (const { name, session } of tile.styles) {
      const value = values[name];
      if (value !== undefined) {
        session.set(value);
      }
    }
  }

  /**
   * Restores every captured style and resize marker, even if one cleanup fails.
   *
   * @param tiles - Tile resources acquired for the gesture.
   * @returns All resources have been offered cleanup.
   * @throws Aggregates cleanup failures.
   */
  private restoreTiles(tiles: readonly FrozenTile[]): void {
    const errors: unknown[] = [];
    for (const tile of tiles) {
      for (const { session } of tile.styles) {
        try {
          session.finish();
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        tile.releaseMarker?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Bento tile cleanup failed");
    }
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
}
