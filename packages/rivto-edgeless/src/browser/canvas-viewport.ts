import { CanvasEvents } from "./canvas-events";
import type { CanvasApi } from "../core/canvas";
import { Store, type CanvasSnapshot } from "../utils/store";

/** Mounted DOM layers; absent before mount, during SSR and after detach. */
export interface CanvasViewportLayers {
  readonly root: HTMLElement;
  readonly plane: HTMLElement;
}

/** Owns the browser attachment of a scene without owning its document or React rendering. */
export class CanvasViewport {
  private static readonly mountedViewports = new WeakMap<Element, CanvasViewport>();
  /** Native input registrations retained across DOM detach and remount. */
  readonly events = new CanvasEvents();
  private readonly layersStore = new Store<CanvasViewportLayers | null>(null);
  readonly layers: CanvasSnapshot<CanvasViewportLayers | null> = this.layersStore;

  /**
   * Creates an unattached browser view without accessing the DOM.
   *
   * @param canvas - Scene displayed by this viewport; its lifetime remains with the editor.
   */
  constructor(readonly canvas: CanvasApi) {}

  /**
   * Publishes the mounted layers to extensions and imperative browser consumers.
   *
   * One viewport accepts one attachment at a time. The disposer belongs to this
   * attachment only and is safe to call again after a later mount.
   *
   * @param root - Focusable viewport containing the world layer.
   * @param plane - Mounted world-coordinate layer inside root.
   * @returns Cleanup withdrawing these DOM layers without disposing the scene.
   * @throws If already attached, the root has another owner, or the plane is outside root.
   * Also propagates observer failures after withdrawing the attachment; if cleanup
   * notification fails too, both failures are included in an AggregateError.
   */
  attach(root: HTMLElement, plane: HTMLElement): () => void {
    if (this.layers.get() || CanvasViewport.mountedViewports.has(root)) {
      throw new Error("Canvas viewport already has a mounted owner");
    }
    if (!root.contains(plane)) {
      throw new Error("Canvas world layer must belong to its viewport");
    }
    const layers = { root, plane };
    const detachEvents = this.events.attach(root);
    CanvasViewport.mountedViewports.set(root, this);
    try {
      this.layersStore.set(layers);
    } catch (error) {
      detachEvents();
      CanvasViewport.mountedViewports.delete(root);
      try {
        this.layersStore.set(null);
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Viewport attachment failed");
      }
      throw error;
    }
    return () => {
      if (this.layers.get() !== layers) {
        return;
      }
      detachEvents();
      CanvasViewport.mountedViewports.delete(root);
      this.layersStore.set(null);
    };
  }

  /**
   * Finds the nearest mounted viewport containing a DOM node.
   *
   * @param element - Target inside a viewport or one of its nested editors; null before mount is allowed.
   * @returns Nearest mounted owner, or undefined outside a mounted canvas view.
   */
  static forElement(element: Element | null): CanvasViewport | undefined {
    let current: Element | null = element;
    while (current) {
      const viewport = CanvasViewport.mountedViewports.get(current);
      if (viewport) {
        return viewport;
      }
      current = current.parentElement;
    }
    return undefined;
  }
}
