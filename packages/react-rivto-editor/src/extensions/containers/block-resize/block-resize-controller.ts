import { normalizeResizeWidth } from "./block-resize-size";
import type { ReactPanelApi } from "../../../panels/types";
import { BLOCK_ID_ATTRIBUTE } from "../../../constants";
import { isBlockStyle } from "../../../blocks/block-style";
import { RESIZING_HANDLE_ATTRIBUTE, RESIZING_PLACEMENT_ATTRIBUTE } from "./block-resize-constants";

/** Edge or corner of a placement used as the resize origin. */
export type BlockResizeEdge =
  "left" | "right" | "top" | "bottom" | "top-left" | "top-right" | "bottom-left" | "bottom-right";

/** Height bounds in CSS pixels for an interactive resize. */
export const MIN_RESIZE_HEIGHT = 48;
export const MAX_RESIZE_HEIGHT = 2000;

const HEIGHT_PROPERTIES = ["height", "min-height", "max-height", "overflow-y"] as const;

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
  "margin-top",
  "margin-bottom",
] as const;

/** Saved inline declaration, including the priority restored after a gesture. */
interface PlacementInlineStyle {
  readonly name: string;
  readonly value: string;
  readonly priority: string;
}

/** One measured placement and the inline declarations restored when its gesture ends. */
interface FrozenPlacement {
  readonly element: HTMLElement;
  readonly width: number;
  readonly styles: readonly PlacementInlineStyle[];
}

/** Active pointer resize state retained without rerendering on every pixel. */
interface BlockResizeGesture {
  readonly pointerId: number;
  readonly handle: HTMLElement;
  readonly edge: BlockResizeEdge;
  readonly startX: number;
  readonly startWidth: number;
  readonly startY: number;
  readonly startHeight: number;
  readonly heightTarget: HTMLElement;
  readonly heightStyles: readonly PlacementInlineStyle[];
  readonly frozen: readonly FrozenPlacement[];
  width: number;
  height: number;
}

/** Owns one placement's preview, pointer capture and cancellation resources. */
export class BlockResizeController {
  private gesture: BlockResizeGesture | undefined;

  /**
   * Borrows only addressed reads and ordinary block commands from the panel.
   *
   * The mounted handle component owns this controller and cancels it on detach.
   * No document write occurs until pointer release or an explicit arrow-key adjustment.
   *
   * @param blocks - Live block reads and mutation commands; lifecycle remains with the panel.
   * @param blockId - Persisted placement identity receiving style and plugin-data dimensions.
   * @param placement - Explicit Page placement or retained Edgeless block shell.
   * @param pluginId - Optional block plugin-data key for a layout-owned width; omission writes the block style.
   * @param originalWidthPluginId - Optional key recording the prior style width if it was not captured on entry.
   * @param heightPluginId - Optional plugin-data key for the layout-owned height and policy.
   * @param originalHeightPluginId - Optional key recording the height and policy before layout changes.
   * @param heightTarget - Block shell receiving height previews; defaults to the placement.
   */
  constructor(
    private readonly blocks: Pick<ReactPanelApi["blocks"], "getBlockNode" | "updateBlock">,
    private readonly blockId: string,
    private readonly placement: HTMLElement,
    private readonly pluginId?: string,
    private readonly originalWidthPluginId?: string,
    private readonly heightPluginId?: string,
    private readonly originalHeightPluginId?: string,
    private readonly heightTarget?: HTMLElement,
  ) {}

  /**
   * Reads a pixel width from a stored style, using a measured fallback for other units.
   *
   * @param style - Untrusted persisted block style.
   * @param placement - Placement measured when the stored width is absent or uses non-pixel units.
   * @returns Width clamped to the supported placement range.
   */
  static getStyleWidth(style: unknown, placement?: HTMLElement): number {
    const width = isBlockStyle(style) ? style.size?.width : undefined;
    const match = typeof width === "string" ? /^(\d+(?:\.\d+)?)(?:px)?$/.exec(width.trim()) : null;
    if (match) {
      return normalizeResizeWidth(Number(match[1]));
    }
    return normalizeResizeWidth(placement?.offsetWidth || 280);
  }

  /**
   * Reads a plugin-owned pixel width, falling back to the measured placement.
   *
   * @param value - Untrusted block plugin-data value.
   * @param placement - Placement measured when the value is absent or invalid.
   * @returns Width clamped to the supported range, defaulting to 280 pixels when no measurement exists.
   */
  static getPluginWidth(value: unknown, placement?: HTMLElement): number {
    if (typeof value === "number" && Number.isFinite(value)) {
      return normalizeResizeWidth(value);
    }
    return normalizeResizeWidth(placement?.offsetWidth || 280);
  }

  /**
   * Starts a pointer resize from an edge or corner without writing the document.
   *
   * For horizontal axes, all sibling widths are read before any layout writes.
   * Vertical-only gestures avoid measuring or freezing sibling widths. Capture and window
   * cancellation listeners belong to this gesture and are rolled back on failure.
   *
   * @param edge - Side whose movement should grow or shrink the placement.
   * @param event - Primary-button pointer down delivered by the owning handle.
   * @param handle - Actual separator receiving pointer capture and active feedback.
   * @returns The siblings are frozen and one local preview is active, or no change for another button.
   * @throws Propagates browser capture failures after rolling back acquired resources.
   */
  start(edge: BlockResizeEdge, event: PointerEvent, handle: HTMLElement): void {
    const lane = this.placement.parentElement;
    if (event.button !== 0 || !lane) {
      return;
    }
    this.cancel();
    event.preventDefault();
    event.stopPropagation();
    const horizontal = edge.includes("left") || edge.includes("right");
    const frozen = horizontal
      ? this.measurePlacements(lane)
      : [
          {
            element: this.placement,
            width: 0,
            styles: ["margin-top", "margin-bottom"].map((name) => ({
              name,
              value: this.placement.style.getPropertyValue(name),
              priority: this.placement.style.getPropertyPriority(name),
            })),
          },
        ];
    let startWidth = 0;
    if (horizontal) {
      startWidth =
        frozen.find(({ element }) => element === this.placement)?.width ??
        this.placement.offsetWidth;
    }
    const heightTarget = this.heightTarget ?? this.placement;
    const startHeight = heightTarget.offsetHeight;
    this.gesture = {
      pointerId: event.pointerId,
      handle,
      edge,
      startX: event.clientX,
      startWidth,
      startY: event.clientY,
      startHeight,
      heightTarget,
      heightStyles: HEIGHT_PROPERTIES.map((name) => ({
        name,
        value: heightTarget.style.getPropertyValue(name),
        priority: heightTarget.style.getPropertyPriority(name),
      })),
      frozen,
      width: startWidth,
      height: startHeight,
    };
    try {
      if (horizontal) {
        this.freezePlacements(frozen);
      }
      handle.setPointerCapture(event.pointerId);
      handle.setAttribute(RESIZING_HANDLE_ATTRIBUTE, "true");
      const view = this.placement.ownerDocument.defaultView;
      view?.addEventListener("blur", this.cancel);
      view?.addEventListener("keydown", this.cancelOnEscape, true);
      this.preview(this.gesture);
    } catch (error) {
      try {
        this.cancel();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Width resize setup and cleanup failed");
      }
      throw error;
    }
  }

  /**
   * Follows the pointer with a local preview while sibling flex slots stay frozen.
   *
   * @param event - Captured pointer movement; other pointer identities are ignored.
   * @returns Final dimensions are retained on the gesture without a model write or layout read.
   */
  move(event: PointerEvent): void {
    const active = this.gesture;
    if (!active || active.pointerId !== event.pointerId) {
      return;
    }
    if (active.edge.includes("left") || active.edge.includes("right")) {
      const delta = event.clientX - active.startX;
      active.width = normalizeResizeWidth(
        active.startWidth + (active.edge.includes("right") ? delta : -delta),
      );
    }
    if (active.edge.includes("top") || active.edge.includes("bottom")) {
      const delta = event.clientY - active.startY;
      active.height = Math.max(
        MIN_RESIZE_HEIGHT,
        Math.min(
          MAX_RESIZE_HEIGHT,
          active.startHeight + (active.edge.includes("bottom") ? delta : -delta),
        ),
      );
    }
    this.preview(active);
  }

  /**
   * Ends capture, restores frozen siblings and optionally persists the final pointer dimensions.
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
    // The preview width can change wrapping, so measure its content before restoring styles.
    const contentHeight =
      commit && (active.edge.includes("top") || active.edge.includes("bottom"))
        ? active.heightTarget.scrollHeight
        : 0;
    this.cancel();
    if (commit && (active.width !== active.startWidth || active.height !== active.startHeight)) {
      this.commitDimensions(
        active.edge.includes("left") || active.edge.includes("right") ? active.width : undefined,
        active.edge.includes("top") || active.edge.includes("bottom") ? active.height : undefined,
        contentHeight,
      );
    }
  }

  /**
   * Offers keyboard resizing on the focused edge or corner handle.
   *
   * Each arrow reads current dimensions, so repeated keys do not reuse a stale render.
   *
   * @param edge - Side that owns the focused handle.
   * @param event - Arrow key event; Shift changes the step from 10 to 50 CSS pixels.
   * @returns One adjustment is committed for a supported arrow; other keys retain their behavior.
   * @throws Propagates delegated block-command failures.
   */
  resizeWithKeyboard(edge: BlockResizeEdge, event: KeyboardEvent): void {
    const horizontal = event.key === "ArrowLeft" || event.key === "ArrowRight";
    const vertical = event.key === "ArrowUp" || event.key === "ArrowDown";
    if (
      (!horizontal || !(edge.includes("left") || edge.includes("right"))) &&
      (!vertical || !(edge.includes("top") || edge.includes("bottom")))
    ) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    let grows = edge.includes("bottom") === (event.key === "ArrowDown");
    if (horizontal) {
      grows = edge.includes("right") === (event.key === "ArrowRight");
    }
    const direction = grows ? 1 : -1;
    const step = event.shiftKey ? 50 : 10;
    if (horizontal) {
      const block = this.blocks.getBlockNode(this.blockId);
      const width = this.pluginId
        ? BlockResizeController.getPluginWidth(block?.pluginData[this.pluginId], this.placement)
        : BlockResizeController.getStyleWidth(block?.listProps.style, this.placement);
      this.commitDimensions(width + direction * step, undefined, 0);
      return;
    }
    const heightTarget = this.heightTarget ?? this.placement;
    const height = heightTarget.offsetHeight + direction * step;
    this.commitDimensions(undefined, height, this.measureContentHeight(heightTarget));
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
    const view = this.placement.ownerDocument.defaultView;
    view?.removeEventListener("blur", this.cancel);
    view?.removeEventListener("keydown", this.cancelOnEscape, true);
    active.handle.removeAttribute(RESIZING_HANDLE_ATTRIBUTE);
    const errors: unknown[] = [];
    try {
      for (const { name, value, priority } of active.heightStyles) {
        active.heightTarget.style.setProperty(name, value, priority);
      }
    } catch (error) {
      errors.push(error);
    }
    for (const frozen of active.frozen) {
      try {
        for (const { name, value, priority } of frozen.styles) {
          frozen.element.style.setProperty(name, value, priority);
        }
        frozen.element.removeAttribute(RESIZING_PLACEMENT_ATTRIBUTE);
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
      throw new AggregateError(errors, "Width resize cleanup failed");
    }
  };

  /**
   * Locks every direct placement to its current rendered width so wrap and grow stay
   * still for one resize gesture.
   *
   * @param lane - Children container owning the measured block placements.
   * @returns Measured placements and saved declarations; no styles have been written yet.
   */
  private measurePlacements(lane: HTMLElement): FrozenPlacement[] {
    const placements: FrozenPlacement[] = [];
    for (const child of lane.children) {
      if (
        !(child instanceof this.placement.ownerDocument.defaultView!.HTMLElement) ||
        (!child.hasAttribute(BLOCK_ID_ATTRIBUTE) && !child.hasAttribute("data-block-item-id"))
      ) {
        continue;
      }
      placements.push({
        element: child,
        width: child.offsetWidth,
        styles: RESIZE_PROPERTIES.map((name) => ({
          name,
          value: child.style.getPropertyValue(name),
          priority: child.style.getPropertyPriority(name),
        })),
      });
    }
    return placements;
  }

  /**
   * Applies previously measured flex slots without alternating geometry reads and writes.
   *
   * @param placements - All direct placement measurements captured before freezing begins.
   * @returns Every placement retains its original slot width until the gesture ends.
   */
  private freezePlacements(placements: readonly FrozenPlacement[]): void {
    for (const { element, width } of placements) {
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
   * the active placement.
   *
   * @param origin - In-flow width captured at pointer down.
   * @param preview - Clamped visual width following the pointer.
   * @param edge - Side the user is dragging.
   * @returns Styles are written directly to the owned placement, without document mutation.
   */
  private previewPlacement(origin: number, preview: number, edge: BlockResizeEdge): void {
    const placement = this.placement;
    const compensation = origin - preview;
    placement.style.flex = "0 0 auto";
    placement.style.width = `${preview}px`;
    placement.style.minWidth = `${preview}px`;
    placement.style.maxWidth = "none";
    placement.style.marginLeft = edge.includes("left") ? `${compensation}px` : "0px";
    placement.style.marginRight = edge.includes("right") ? `${compensation}px` : "0px";
    placement.style.position = "relative";
    placement.style.zIndex = "8";
    placement.setAttribute(RESIZING_PLACEMENT_ATTRIBUTE, edge);
  }

  /**
   * Paints the active axes without writing persisted block data.
   *
   * @param active - Gesture with its measured origins and latest dimensions.
   * @returns The resized placement and block shell display the current preview.
   */
  private preview(active: BlockResizeGesture): void {
    if (active.edge.includes("left") || active.edge.includes("right")) {
      this.previewPlacement(active.startWidth, active.width, active.edge);
    } else {
      this.placement.setAttribute(RESIZING_PLACEMENT_ATTRIBUTE, active.edge);
    }
    if (active.edge.includes("top") || active.edge.includes("bottom")) {
      active.heightTarget.style.height = `${active.height}px`;
      active.heightTarget.style.minHeight = "0";
      active.heightTarget.style.maxHeight = "none";
      active.heightTarget.style.overflowY = "auto";
      if (active.edge.includes("top")) {
        const offset = active.startHeight - active.height;
        this.placement.style.marginTop = `${offset}px`;
        this.placement.style.marginBottom = `${-offset}px`;
      }
    }
  }

  /**
   * Measures content without letting the current minimum height inflate scroll height.
   *
   * @param target - Block shell whose current inline declarations must be restored.
   * @returns Content height in CSS pixels after restoring all temporary styles.
   */
  private measureContentHeight(target: HTMLElement): number {
    const saved = HEIGHT_PROPERTIES.map((name) => ({
      name,
      value: target.style.getPropertyValue(name),
      priority: target.style.getPropertyPriority(name),
    }));
    try {
      target.style.height = "0px";
      target.style.minHeight = "0px";
      target.style.maxHeight = "none";
      target.style.overflowY = "auto";
      return target.scrollHeight;
    } finally {
      for (const { name, value, priority } of saved) {
        target.style.setProperty(name, value, priority);
      }
    }
  }

  /**
   * Persists the requested placement dimensions through one ordinary block command.
   *
   * @param width - Requested width in CSS pixels, or undefined to preserve width.
   * @param height - Requested height in CSS pixels, or undefined to preserve height.
   * @param contentHeight - Current scroll height used to select scrolling when shrinking.
   * @returns No model change when the block is gone or its current value is unchanged.
   * @throws If an existing style or size cannot be merged, or a delegated command fails.
   */
  private commitDimensions(
    width: number | undefined,
    height: number | undefined,
    contentHeight: number,
  ): void {
    const block = this.blocks.getBlockNode(this.blockId);
    if (!block) {
      return;
    }
    const style = block.listProps.style;
    if (style !== undefined && !isBlockStyle(style)) {
      throw new Error("Cannot resize a block with a non-object style");
    }
    const size = style?.size;
    if (size !== undefined && (typeof size !== "object" || size === null || Array.isArray(size))) {
      throw new Error("Cannot resize a block with a non-object size style");
    }
    const next = width === undefined ? undefined : normalizeResizeWidth(width);
    const nextHeight =
      height === undefined
        ? undefined
        : Math.max(MIN_RESIZE_HEIGHT, Math.min(MAX_RESIZE_HEIGHT, height));
    const nextSize = { ...size };
    const pluginData: Record<string, unknown> = {};
    if (next !== undefined) {
      nextSize.width = `${next}px`;
    }
    if (nextHeight !== undefined) {
      nextSize.height = `${nextHeight}px`;
      if ((!size?.heightPolicy || size.heightPolicy === "grow") && nextHeight < contentHeight) {
        nextSize.heightPolicy = "scroll";
      }
      if (this.heightPluginId) {
        pluginData[this.heightPluginId] = {
          height: nextSize.height,
          heightPolicy: nextSize.heightPolicy ?? "grow",
        };
      }
      if (this.originalHeightPluginId && !block.pluginData[this.originalHeightPluginId]) {
        pluginData[this.originalHeightPluginId] = {
          height: size && Object.hasOwn(size, "height") ? { value: size.height } : {},
          policy: size && Object.hasOwn(size, "heightPolicy") ? { value: size.heightPolicy } : {},
        };
      }
    }
    if (this.pluginId && next !== undefined) {
      pluginData[this.pluginId] = next;
      if (this.originalWidthPluginId && !block.pluginData[this.originalWidthPluginId]) {
        pluginData[this.originalWidthPluginId] =
          size && Object.hasOwn(size, "width")
            ? { present: true, value: size.width }
            : { present: false };
      }
    }
    if (
      nextSize.width === size?.width &&
      nextSize.height === size?.height &&
      nextSize.heightPolicy === size?.heightPolicy &&
      Object.entries(pluginData).every(([key, value]) => block.pluginData[key] === value)
    ) {
      return;
    }
    this.blocks.updateBlock(this.blockId, {
      listProps: { ...block.listProps, style: { ...style, size: nextSize } },
      ...(Object.keys(pluginData).length ? { pluginData } : {}),
    });
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
