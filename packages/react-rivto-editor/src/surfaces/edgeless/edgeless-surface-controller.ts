import type { MouseInput, PointerInput, WheelInput } from "@chulane/rivto-root";
import type { CanvasViewportApi } from "@chulane/rivto-edgeless/react";
import { EDGELESS_GRID_SIZE } from "../../elements/visuals/utils/geometry";
import { createCaretSelection } from "@chulane/rivto";
import type {
  Camera,
  Canvas,
  Point,
  Rect,
  EdgelessSnappingSnapshot,
} from "@chulane/rivto-edgeless";
import type { CSSProperties } from "react";
import { EDITOR_CONTROL_SELECTOR } from "../../constants";
import type {
  EdgelessPanAttachment,
  EdgelessPanMarker,
  EdgelessPanRoot,
  EdgelessSurfacePanel,
} from "./types";
import {
  EDGELESS_BLOCK_ELEMENT_TYPE,
  EDGELESS_CARD_DEFAULT_FRAME,
  insertBlockElementSeparator,
  nonOverlappingBlockFrame,
} from "../../elements/block-element-projection";

/** Owns host viewport policy and transactional empty-space card creation. */
export class EdgelessSurfaceController {
  private static readonly minimumZoom = 0.5;
  /** Strongest background-dot fade at minimum zoom; keeps a faint residual grid. */
  private static readonly maximumGridDotFade = 0.7;
  private panAttachment?: EdgelessPanAttachment;
  /**
   * Binds the document occurrence and current card-placement configuration.
   *
   * @param panel - Receiving document occurrence and mutation managers.
   * @param canvas - Scene receiving surface snapping preferences.
   * @param avoidOverlap - Whether new cards are moved away from existing cards.
   * @param cardWidth - Preferred world width; invalid values use the default card width.
   */
  constructor(
    private readonly panel: EdgelessSurfacePanel,
    private readonly canvas: Pick<Canvas, "setSnapping">,
    private readonly avoidOverlap: boolean,
    private readonly cardWidth: number,
  ) {}

  /**
   * Appends and focuses one default root card at an empty canvas point.
   *
   * Deferred focus is cancelled if input, selection, or the panel occurrence
   * changes before the scheduled frame.
   *
   * @param event - Normalized double click originating in the receiving viewport.
   * @param viewport - Attached occurrence providing client-to-world conversion.
   * @returns One document transaction inserts the card; caret focus follows on the next frame.
   */
  createBlockAt(
    event: MouseInput<"dblclick">,
    viewport: Pick<CanvasViewportApi, "clientToWorld">,
  ): void {
    const target = event.target;
    if (!target || event.button !== 0) {
      return;
    }
    if (
      target.hasAncestor('[data-edgeless-pan-tool="true"], [data-edgeless-capture-tool="true"]')
    ) {
      return;
    }
    if (
      target.hasAncestor(
        `[data-edgeless-root], [data-edgeless-object-kind], [data-edgeless-ui], ${EDITOR_CONTROL_SELECTOR}`,
      ) ||
      target.hasAncestor(".edgeless-drawing-capture[data-active]")
    ) {
      return;
    }
    const point = viewport.clientToWorld({ x: event.clientX, y: event.clientY });
    if (!point) {
      return;
    }
    const frame = this.getCardFrame(point);
    const id = this.insertCard(frame);
    this.panel.selection.set(createCaretSelection(id, 0));
    this.panel.selection.scheduleIfSelectionUnchanged(() => this.panel.selection.focusBlock(id, 0));
  }

  /**
   * Mirrors the surface snapping settings into its independent scene.
   *
   * The scene receives grid and alignment policy while React observes the host-owned
   * settings store for toolbar controls and viewport markers.
   *
   * @param snapshot - Current surface grid-snapping and object-alignment preferences.
   * @returns The receiving scene's snapping policy reflects the current preferences.
   */
  applySnapping(snapshot: EdgelessSnappingSnapshot): void {
    this.canvas.setSnapping({
      grid: EDGELESS_GRID_SIZE,
      snap: snapshot.snapToGrid,
      align: snapshot.alignObjects,
    });
  }

  /**
   * Binds pan markers to one exact mounted Root without owning its lifecycle.
   *
   * @param root - Borrowed occurrence whose marker cleanup remains owned here.
   * @returns Idempotent cleanup restoring markers installed by this attachment, or a no-op after detachment.
   * @throws If another occurrence is attached or marker cleanup fails.
   */
  attachPanRoot(root: EdgelessPanRoot): () => void {
    if (this.panAttachment) {
      throw new Error("Pan Root is already attached");
    }
    if (!root.isAttached()) {
      return () => {};
    }
    const attachment: EdgelessPanAttachment = { root };
    this.panAttachment = attachment;
    return () => this.releasePanAttachment(attachment);
  }

  /**
   * Supplies document-specific DOM markers, background styling and native input admission.
   *
   * @param camera - Current world-to-screen camera.
   * @param snap - Current surface snapping settings.
   * @param root - Exact occurrence bound to these pan callbacks, when attached.
   * @returns Props for the generic viewport without exposing document policies to Canvas.
   */
  getViewportProps(
    camera: Camera,
    snap: EdgelessSnappingSnapshot,
    root: EdgelessPanRoot | undefined,
  ) {
    return {
      panEnabled: () => this.isPanEnabled(root),
      allowCamera: this.allowSurfaceCamera,
      onPanState: (ready: boolean, active: boolean) => this.updatePanMarkers(root, ready, active),
      planeProps: { className: "edgeless-plane", "data-edgeless-plane": "true" },
      "data-rivto-surface": "edgeless",
      "data-rivto-block-editor": "true",
      className: "edgeless-viewport",
      "data-edgeless-zoom": camera.zoom,
      "data-edgeless-pan-x": camera.x,
      "data-edgeless-pan-y": camera.y,
      "data-edgeless-grid": EDGELESS_GRID_SIZE,
      "data-edgeless-snap": snap.snapToGrid ? "true" : "false",
      "data-edgeless-align": snap.alignObjects ? "true" : "false",
      "aria-label": "Edgeless document canvas",
      tabIndex: -1,
      style: {
        backgroundPosition: `${camera.x}px ${camera.y}px`,
        backgroundSize: `${EDGELESS_GRID_SIZE * camera.zoom}px ${EDGELESS_GRID_SIZE * camera.zoom}px`,
        "--rivto-edgeless-zoom": String(camera.zoom),
        "--rivto-edgeless-grid-dot-fade": this.gridDotFade(camera.zoom),
      } as CSSProperties,
    };
  }

  /**
   * Computes the preferred card frame and applies the configured overlap policy.
   *
   * @param point - Requested top-left position in world units.
   * @returns Placement frame using a finite positive width or the default width.
   */
  private getCardFrame(point: Point): Rect {
    const preferred = {
      ...EDGELESS_CARD_DEFAULT_FRAME,
      ...point,
      width:
        Number.isFinite(this.cardWidth) && this.cardWidth > 0
          ? this.cardWidth
          : EDGELESS_CARD_DEFAULT_FRAME.width,
    };
    if (!this.avoidOverlap) {
      return preferred;
    }
    return nonOverlappingBlockFrame(
      preferred,
      this.panel.elements
        .getElementNodes()
        .filter((element) => element.type === EDGELESS_BLOCK_ELEMENT_TYPE)
        .map((element) => element.frame),
    );
  }

  /**
   * Inserts a writing block and its card together, separating it from the preceding card.
   *
   * @param frame - Resolved world placement of the new card.
   * @returns ID of the inserted writing block for caret placement.
   * @throws Propagates document mutation failures from the receiving panel.
   */
  private insertCard(frame: Rect): string {
    const roots = this.panel.blocks
      .getRootIds()
      .flatMap((id) => this.panel.blocks.getBlockNode(id) ?? []);
    const zIndex =
      Math.max(0, ...this.panel.elements.getElementNodes().map((element) => element.zIndex)) + 1;
    let id = "";
    this.panel.batchUpdates(() => {
      let afterId = roots.at(-1)?.id;
      const last = roots.at(-1);
      if (last && !this.panel.editor.blockTypes.separatesBlockElements(last.type)) {
        afterId = insertBlockElementSeparator(this.panel, last.id).id;
      }
      id = this.panel.blocks.insertBlock(
        this.panel.editor.defaultWritingBlockFactory.createEmptyBlock(),
        this.panel.blocks.getInsertionDestinationAfter(afterId),
      ).id;
      this.panel.elements.insertElement({
        type: EDGELESS_BLOCK_ELEMENT_TYPE,
        frame,
        zIndex,
        props: { startBlockId: id, endBlockId: id },
      });
    });
    return id;
  }
  /**
   * Preserves native scrolling inside fixed-height cards and editor controls.
   *
   * @param event - Normalized pointer or wheel input inside the viewport.
   * @returns Whether Canvas may consume this sample for camera movement.
   */
  private readonly allowSurfaceCamera = (event: PointerInput | WheelInput): boolean => {
    if (event.type !== "wheel" && event.button === 1) {
      return true;
    }
    if (!event.target) {
      return true;
    }
    if (event.target.hasAncestor("[data-edgeless-ui]")) {
      return false;
    }
    return (
      event.type !== "wheel" ||
      !event.target.hasAncestor('[data-auto-height="false"] [data-edgeless-card-content]')
    );
  };

  /**
   * Publishes camera gesture state for cursor styling and spotlight suppression.
   *
   * @param root - Exact occurrence that received this callback.
   * @param ready - Whether a pan tool or modifier is active.
   * @param active - Whether a pointer currently owns a camera pan.
   * @returns Stale markers are removed when their state becomes false.
   * @throws Propagates marker and cleanup failures.
   */
  private updatePanMarkers(
    root: EdgelessPanRoot | undefined,
    ready: boolean,
    active: boolean,
  ): void {
    const attachment = this.panAttachment;
    if (!root || !attachment || attachment.root !== root || !root.isAttached()) {
      return;
    }
    try {
      this.setPanMarker(attachment, "ready", "data-panning-ready", ready);
      this.setPanMarker(attachment, "active", "data-panning", active);
    } catch (error) {
      try {
        this.releasePanAttachment(attachment);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Pan marker update failed");
      }
      throw error;
    }
  }

  /**
   * Acquires or releases one marker without overwriting a replacement occurrence.
   *
   * @param attachment - Captured occurrence that owns the marker.
   * @param marker - Stored cleanup slot for this marker.
   * @param name - Presentation attribute to set while the marker is active.
   * @param enabled - Whether this marker should be present.
   * @returns The captured marker reflects the requested state when still current.
   * @throws Propagates marker, ownership, and cleanup failures.
   */
  private setPanMarker(
    attachment: EdgelessPanAttachment,
    marker: EdgelessPanMarker,
    name: string,
    enabled: boolean,
  ): void {
    if (!enabled) {
      const release = attachment[marker];
      attachment[marker] = undefined;
      release?.();
      return;
    }
    if (attachment[marker] || this.panAttachment !== attachment || !attachment.root.isAttached()) {
      return;
    }
    const release = attachment.root.setTemporaryAttribute(name, "true");
    try {
      if (this.panAttachment === attachment && attachment.root.isAttached()) {
        attachment[marker] = release;
      } else {
        release();
      }
    } catch (error) {
      try {
        release();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Pan marker setup failed");
      }
      throw error;
    }
  }

  /**
   * Releases the markers belonging to a captured occurrence.
   *
   * @param attachment - Owner whose marker leases must be released.
   * @returns Both marker leases have been released even after detachment.
   * @throws AggregateError if any cleanup fails.
   */
  private releasePanAttachment(attachment: EdgelessPanAttachment): void {
    if (this.panAttachment === attachment) {
      this.panAttachment = undefined;
    }
    const releases = [attachment.active, attachment.ready];
    attachment.active = undefined;
    attachment.ready = undefined;
    const errors: unknown[] = [];
    for (const release of releases) {
      try {
        release?.();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) {
      throw new AggregateError(errors, "Pan marker cleanup failed");
    }
  }

  /**
   * Mix amount toward transparent background grid dots at the current zoom.
   *
   * 100% zoom keeps the designed pale dots. As scale drops toward the minimum,
   * packed cells fade, but a residual mix remains so the field never vanishes.
   *
   * @param zoom - Viewport scale already clamped to `[0.5, 2]`.
   * @returns A CSS percentage for `--rivto-edgeless-grid-dot-fade`.
   */
  private gridDotFade(zoom: number): string {
    const amount =
      Math.max(0, Math.min(1, (1 - zoom) / (1 - EdgelessSurfaceController.minimumZoom))) *
      EdgelessSurfaceController.maximumGridDotFade;
    return `${Math.round(amount * 100)}%`;
  }

  /**
   * Reads live pan-tool state from the exact mounted occurrence.
   *
   * @param root - Occurrence captured when the viewport callbacks were created.
   * @returns Whether primary-button panning is enabled, or false while detached or replaced.
   * @throws Propagates occurrence ownership and attribute-read failures.
   */
  private isPanEnabled(root: EdgelessPanRoot | undefined): boolean {
    const attachment = this.panAttachment;
    if (!root || !attachment || attachment.root !== root || !root.isAttached()) {
      return false;
    }
    const enabled = root.readAttribute("data-edgeless-pan-tool") === "true";
    return enabled && this.panAttachment === attachment && root.isAttached();
  }
}
