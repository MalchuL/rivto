import { EDGELESS_GRID_SIZE } from "../../elements/visuals/utils/geometry";
import { createCaretSelection } from "@chulane/rivto";
import type {
  Camera,
  Canvas,
  Point,
  Rect,
  EdgelessSnappingSnapshot,
} from "@chulane/rivto-edgeless";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import type { ReactPanelApi } from "../../panels/types";
import { EDITOR_CONTROL_SELECTOR } from "../../constants";
import { focusBlock } from "../../managers";
import {
  EDGELESS_BLOCK_ELEMENT_TYPE,
  EDGELESS_CARD_DEFAULT_FRAME,
  insertBlockElementSeparator,
  nonOverlappingBlockFrame,
} from "../../elements/block-element-projection";

/** Shared block definitions borrowed for new-card creation. */
interface EdgelessSurfaceDocument {
  readonly blockTypes: Pick<
    ReactPanelApi["editor"]["blockTypes"],
    "separatesBlockElements" | "getDefaultBlockElementSeparatorType"
  >;
  readonly defaultWritingBlockFactory: Pick<
    ReactPanelApi["editor"]["defaultWritingBlockFactory"],
    "createEmptyBlock"
  >;
}

/** Document operations borrowed by viewport gestures without lifecycle ownership. */
interface EdgelessSurfacePanel extends Pick<ReactPanelApi, "batchUpdates"> {
  readonly blocks: Pick<
    ReactPanelApi["blocks"],
    "getRootIds" | "getBlockNode" | "canRemove" | "insertBlock" | "getInsertionDestinationAfter"
  >;
  readonly elements: Pick<ReactPanelApi["elements"], "getElementNodes" | "insertElement">;
  readonly selection: Pick<ReactPanelApi["selection"], "set">;
  readonly editor: EdgelessSurfaceDocument;
}

/** Owns host viewport policy and transactional empty-space card creation. */
export class EdgelessSurfaceController {
  private static readonly minimumZoom = 0.5;
  /** Strongest background-dot fade at minimum zoom; keeps a faint residual grid. */
  private static readonly maximumGridDotFade = 0.7;
  viewport: HTMLElement | null = null;
  /**
   * Binds the document occurrence and current card-placement configuration.
   *
   * @param panel - Receiving document occurrence and mutation managers.
   * @param canvas - Scene supplying live world-coordinate conversion.
   * @param avoidOverlap - Whether new cards are moved away from existing cards.
   * @param cardWidth - Preferred world width; invalid values use the default card width.
   */
  constructor(
    private readonly panel: EdgelessSurfacePanel,
    private readonly canvas: Pick<Canvas, "toWorld" | "setSnapping">,
    private readonly avoidOverlap: boolean,
    private readonly cardWidth: number,
  ) {}

  /**
   * Appends and focuses one default root card at an empty canvas point.
   *
   * @param event - Double click originating in the receiving viewport.
   * @returns One document transaction inserts the card; caret focus follows on the next frame.
   */
  createBlockAt = (event: ReactMouseEvent<HTMLElement>): void => {
    const root = this.viewport;
    const target = event.target;
    if (!root || !(target instanceof Element) || event.button !== 0) {
      return;
    }
    if (root.dataset.edgelessPanTool === "true" || root.dataset.edgelessCaptureTool === "true") {
      return;
    }
    if (
      target.closest(
        `[data-edgeless-root], [data-edgeless-object-kind], [data-edgeless-ui], ${EDITOR_CONTROL_SELECTOR}`,
      ) ||
      target.closest(".edgeless-drawing-capture[data-active]")
    ) {
      return;
    }
    const rect = root.getBoundingClientRect();
    const point = this.canvas.toWorld({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
    });
    const frame = this.getCardFrame(point);
    const id = this.insertCard(frame);
    this.panel.selection.set(createCaretSelection(id, 0));
    requestAnimationFrame(() => focusBlock(root, id, 0));
  };

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
   * Supplies document-specific DOM markers, background styling and native input admission.
   *
   * @param camera - Current world-to-screen camera.
   * @param snap - Current surface snapping settings.
   * @returns Props for the generic viewport without exposing document policies to Canvas.
   */
  getViewportProps(camera: Camera, snap: EdgelessSnappingSnapshot) {
    return {
      panEnabled: this.isPanEnabled,
      allowCamera: this.allowSurfaceCamera,
      onPanState: this.updatePanMarkers,
      planeProps: { className: "edgeless-plane", "data-edgeless-plane": "true" },
      "data-rivto-surface": "edgeless",
      className: "edgeless-viewport",
      "data-edgeless-zoom": camera.zoom,
      "data-edgeless-pan-x": camera.x,
      "data-edgeless-pan-y": camera.y,
      "data-edgeless-grid": EDGELESS_GRID_SIZE,
      "data-edgeless-snap": snap.snapToGrid ? "true" : "false",
      "data-edgeless-align": snap.alignObjects ? "true" : "false",
      "aria-label": "Edgeless document canvas",
      tabIndex: -1,
      onDoubleClick: this.createBlockAt,
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
   * @param event - Native pointer or wheel input inside the viewport.
   * @returns Whether Canvas may consume this sample for camera movement.
   */
  private readonly allowSurfaceCamera = (event: PointerEvent | WheelEvent): boolean => {
    if (event.type !== "wheel" && event.button === 1) {
      return true;
    }
    if (!(event.target instanceof Element)) {
      return true;
    }
    if (event.target.closest("[data-edgeless-ui]")) {
      return false;
    }
    return (
      event.type !== "wheel" ||
      !event.target.closest('[data-auto-height="false"] [data-edgeless-card-content]')
    );
  };

  /**
   * Publishes camera gesture state for cursor styling and spotlight suppression.
   *
   * @param ready - Whether a pan tool or modifier is active.
   * @param active - Whether a pointer currently owns a camera pan.
   * @returns Stale markers are removed when their state becomes false.
   */
  private readonly updatePanMarkers = (ready: boolean, active: boolean): void => {
    const root = this.viewport;
    if (!root) {
      return;
    }
    if (ready) {
      root.dataset.panningReady = "true";
    } else {
      delete root.dataset.panningReady;
    }
    if (active) {
      root.dataset.panning = "true";
    } else {
      delete root.dataset.panning;
    }
  };

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
   * Reads live pan-tool state from the mounted viewport.
   *
   * @returns Whether primary-button panning is enabled, or false while detached.
   */
  private readonly isPanEnabled = (): boolean => this.viewport?.dataset.edgelessPanTool === "true";
}
