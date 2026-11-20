import { CanvasEvents } from "./canvas-events";
import { BrowserInputRoot } from "@chulane/rivto-root/browser";
import type { CanvasApi } from "../core/canvas";
import type { Point } from "../types/canvas";
import type {
  CanvasInputRoot,
  CanvasInputRootAttachment,
  CanvasViewportCoordinates,
  CanvasViewportLayers,
} from "./types";
import { getBrowserElementIdentity } from "@chulane/rivto-root/browser";
import { containsCanvasViewportPoint } from "./canvas-viewport-hit";
import {
  canvasViewportAttachment,
  createCanvasViewportAttachment,
  mountedCanvasViewports,
} from "./canvas-viewport-attachment";

/** Owns the browser attachment of a scene without owning its document or React rendering. */
export class CanvasViewport<CustomEvents extends object = object> {
  /** Browser input and custom registrations retained across DOM detach and remount. */
  readonly events = new CanvasEvents<CustomEvents>();

  /**
   * Creates an unattached browser view without accessing the DOM.
   *
   * @param canvas - Scene displayed by this viewport; its lifetime remains with the editor.
   */
  constructor(readonly canvas: CanvasApi) {
    createCanvasViewportAttachment(this);
  }

  /**
   * Reads whether this viewport currently owns an attached browser view.
   *
   * @returns True while attachment state is published, including during its observers.
   */
  isAttached(): boolean {
    return canvasViewportAttachment(this).get() !== null;
  }

  /**
   * Observes changes to this viewport's browser attachment.
   *
   * Subscribers are retained across detach and remount; the caller owns their cleanup.
   *
   * @param listener - Callback invoked after attachment state changes.
   * @returns Disposer removing this subscription.
   */
  subscribeAttachment(listener: () => void): () => void {
    return canvasViewportAttachment(this).subscribe(listener);
  }

  /**
   * Measures the mounted world layer's origin in client CSS pixels.
   *
   * This reads current browser layout, including the rendered camera transform.
   *
   * @returns Current client position, or undefined before attachment or after detachment.
   */
  getWorldOriginInClient(): Point | undefined {
    const layers = canvasViewportAttachment(this).get();
    if (!layers?.coordinates.isAttached()) {
      return;
    }
    const rect = layers.worldRegion.readBounds();
    return rect && layers.coordinates.isAttached() ? { x: rect.left, y: rect.top } : undefined;
  }

  /**
   * Converts client coordinates to world coordinates using the current attachment and camera.
   *
   * The viewport position and camera are read when called, so pan, zoom and
   * scrolling since an earlier pointer sample are reflected in the result.
   *
   * @param point - Client coordinates in CSS pixels.
   * @returns World coordinates, or undefined before attachment or after detachment.
   */
  clientToWorld(point: Point): Point | undefined {
    const layers = canvasViewportAttachment(this).get();
    if (!layers?.coordinates.isAttached()) {
      return;
    }
    const rect = layers.rootRegion.readBounds();
    if (!rect || !layers.coordinates.isAttached()) {
      return undefined;
    }
    const result = this.canvas.toWorld({ x: point.x - rect.left, y: point.y - rect.top });
    return layers.coordinates.isAttached() ? result : undefined;
  }

  /**
   * Attaches the viewport's browser input and publishes its attachment state.
   *
   * One viewport accepts one attachment at a time. The disposer belongs to this
   * attachment only and is safe to call again after a later mount.
   *
   * @param root - Focusable viewport containing the world layer.
   * @param plane - Mounted world-coordinate layer inside root.
   * @param inputRoot - Existing browser-backed occurrence to borrow; omitted for a standalone viewport.
   * @returns Cleanup withdrawing these DOM layers without disposing the scene.
   * @throws If already attached, the root has another owner, or the plane is outside root.
   * Also propagates observer failures after withdrawing the attachment; if cleanup
   * notification fails too, both failures are included in an AggregateError.
   * Native removal and layer notification failures are collected after ownership
   * is withdrawn and all cleanup has been attempted.
   */
  attach(root: HTMLElement, plane: HTMLElement, inputRoot?: CanvasInputRoot): () => void {
    if (CanvasViewport.hasActiveOwner(root) || canvasViewportAttachment(this).get()) {
      throw new Error("Canvas viewport already has a mounted owner");
    }
    if (!root.contains(plane)) {
      throw new Error("Canvas world layer must belong to its viewport");
    }
    const { occurrence, ownedRoot } = this.prepareInputRoot(root, inputRoot);
    let layers: CanvasViewportLayers;
    let detachEvents: () => void;
    try {
      layers = this.createLayers(root, plane, occurrence);
      if (
        !occurrence.isAttached() ||
        CanvasViewport.hasActiveOwner(root) ||
        canvasViewportAttachment(this).get()
      ) {
        throw new Error("Canvas viewport already has a mounted owner");
      }
      detachEvents = this.events.attach(occurrence);
    } catch (error) {
      try {
        ownedRoot?.detach();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Canvas input Root setup failed");
      }
      throw error;
    }
    mountedCanvasViewports.set(root, this);
    try {
      canvasViewportAttachment(this).set(layers);
    } catch (error) {
      try {
        this.detach(root, detachEvents, ownedRoot);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Viewport attachment failed");
      }
      throw error;
    }
    return () => {
      if (canvasViewportAttachment(this).get() === layers) {
        this.detach(root, detachEvents, ownedRoot);
      }
    };
  }

  /**
   * Borrows the host Root or creates one for a standalone viewport.
   *
   * @param root - Mounted viewport whose identity must match the occurrence.
   * @param inputRoot - Host-owned occurrence, or undefined for standalone mounting.
   * @returns Matching occurrence and any Root owned by the viewport.
   * @throws If the occurrence is detached, mismatched, or a reentrant mount took ownership.
   */
  private prepareInputRoot(
    root: HTMLElement,
    inputRoot?: CanvasInputRoot,
  ): CanvasInputRootAttachment {
    const ownedRoot = inputRoot ? undefined : new BrowserInputRoot(root);
    const occurrence = inputRoot ?? ownedRoot;
    if (
      !occurrence ||
      !occurrence.isAttached() ||
      occurrence.getElementIdentity?.() !== getBrowserElementIdentity(root)
    ) {
      ownedRoot?.detach();
      throw new Error("Canvas input Root must match its mounted viewport");
    }
    if (
      !occurrence.isAttached() ||
      CanvasViewport.hasActiveOwner(root) ||
      canvasViewportAttachment(this).get()
    ) {
      ownedRoot?.detach();
      throw new Error("Canvas viewport already has a mounted owner");
    }
    return { occurrence, ownedRoot };
  }

  /**
   * Withdraws an attachment even when native removal or a layer observer fails.
   *
   * @param root - Root whose mounted owner is being withdrawn.
   * @param detachEvents - Disposer for the corresponding native event attachment.
   * @param ownedRoot - Standalone occurrence created by this viewport, if any.
   * @returns Event cleanup, ownership removal and layer withdrawal have all been attempted.
   * @throws AggregateError containing native listener and layer observer failures.
   */
  private detach(root: HTMLElement, detachEvents: () => void, ownedRoot?: BrowserInputRoot): void {
    const errors: unknown[] = [];
    try {
      detachEvents();
    } catch (error) {
      errors.push(error);
    }
    if (mountedCanvasViewports.get(root) === this) {
      mountedCanvasViewports.delete(root);
    }
    try {
      canvasViewportAttachment(this).set(null);
    } catch (error) {
      errors.push(error);
    }
    try {
      ownedRoot?.detach();
    } catch (error) {
      errors.push(error);
    }
    if (errors.length) {
      throw new AggregateError(errors, "Viewport cleanup failed");
    }
  }

  /**
   * Checks whether a viewport element still has a live canvas owner.
   *
   * @param root - Browser mount whose canvas ownership is being checked.
   * @returns True when the current owner remains attached.
   */
  private static hasActiveOwner(root: HTMLElement): boolean {
    let owner = mountedCanvasViewports.get(root);
    while (owner) {
      const active = canvasViewportAttachment(owner).get()?.coordinates.isAttached() ?? false;
      const current = mountedCanvasViewports.get(root);
      if (current === owner) {
        return active;
      }
      owner = current;
    }
    return false;
  }
  /**
   * Creates the browser layers and coordinate capability for one attachment.
   *
   * @param root - Focusable occurrence receiving input.
   * @param plane - World-coordinate layer owned by the occurrence.
   * @param inputRoot - Borrowed Root controlling this attachment's lifetime.
   * @returns Layers whose coordinate methods become inactive after replacement.
   */
  private createLayers(
    root: HTMLElement,
    plane: HTMLElement,
    inputRoot: CanvasInputRoot,
  ): CanvasViewportLayers {
    const coordinates = this.createCoordinates(inputRoot);
    // The viewport is published only after its Root region has been captured.
    let capturing = true;
    let rootRegion;
    let worldRegion;
    try {
      rootRegion = inputRoot.captureRegionByIdentity(
        getBrowserElementIdentity(root),
        () => capturing || coordinates.isAttached(),
      );
      worldRegion = inputRoot.captureRegionByIdentity(
        getBrowserElementIdentity(plane),
        () => capturing || coordinates.isAttached(),
      );
    } finally {
      capturing = false;
    }
    if (!rootRegion) {
      throw new Error("Canvas viewport is not owned by its input Root");
    }
    if (!worldRegion) {
      throw new Error("Canvas world layer is not owned by its input Root");
    }
    const layers: CanvasViewportLayers = {
      rootIdentity: getBrowserElementIdentity(root),
      root,
      inputRoot,
      plane,
      coordinates,
      rootRegion,
      worldRegion,
      /**
       * Focuses only this current occurrence without scrolling.
       *
       * @returns Focus is requested while this attachment remains active.
       * @throws Propagates browser focus failures.
       */
      focus: () => {
        if (coordinates.isAttached()) {
          inputRoot.focus();
        }
      },
    };
    return layers;
  }
  /**
   * Creates the coordinate capability associated with one viewport attachment.
   *
   * @param inputRoot - Borrowed Root controlling this attachment's lifetime.
   * @returns Browser-free operations that become inactive when replaced.
   */
  private createCoordinates(inputRoot: CanvasInputRoot): CanvasViewportCoordinates {
    const coordinates: CanvasViewportCoordinates = {
      /**
       * Checks whether this exact viewport attachment remains published.
       *
       * @returns False after detachment or replacement.
       */
      isAttached: () =>
        inputRoot.isAttached() && canvasViewportAttachment(this).get()?.coordinates === coordinates,
      /**
       * Checks the topmost browser hit against this exact viewport attachment.
       *
       * @param point - Client coordinates in CSS pixels.
       * @param excludedSelector - Optional selector excluding a hit or its ancestors.
       * @returns False for unavailable, outside, obscured, or excluded targets.
       * @throws If browser hit testing or selector evaluation fails.
       */
      containsClientPoint: (point, excludedSelector) => {
        return containsCanvasViewportPoint(
          inputRoot,
          coordinates.isAttached,
          point,
          excludedSelector,
        );
      },
      /**
       * Measures the world origin only while this attachment remains published.
       *
       * @returns Current client position, or undefined after detach or replacement.
       * @throws Propagates browser geometry measurement failures.
       */
      getWorldOriginInClient: () => {
        if (!coordinates.isAttached()) {
          return undefined;
        }
        const origin = this.getWorldOriginInClient();
        return coordinates.isAttached() ? origin : undefined;
      },
      /**
       * Converts only while this exact attachment remains published.
       *
       * @param point - Client coordinates in CSS pixels.
       * @returns Current world position, or undefined after detach or replacement.
       * @throws Propagates browser geometry measurement failures.
       */
      clientToWorld: (point) => {
        if (!coordinates.isAttached()) {
          return undefined;
        }
        const result = this.clientToWorld(point);
        return coordinates.isAttached() ? result : undefined;
      },
    };
    return coordinates;
  }
}
