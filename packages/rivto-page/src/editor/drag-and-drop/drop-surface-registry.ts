/** Attribute identifying mounted receivers independently of the source drag engine. */
export const DROP_SURFACE_ATTRIBUTE = "data-rivto-cross-document-page-root";
const DROP_SURFACE_SELECTOR = `[${DROP_SURFACE_ATTRIBUTE}]`;

/** The registry borrows DOM identity; it never owns document data or commands. */
export interface DropSurface {
  readonly root: HTMLElement;
}

/** A registered receiver and permission to resolve its enclosing nested boundary. */
export interface DropSurfaceRoute<T extends DropSurface> {
  readonly controller: T;
  readonly nestedBoundary: boolean;
}

/** One attachment, including an optional live content boundary for a subtree view. */
interface DropSurfaceEntry<T extends DropSurface> {
  readonly controller: T;
  /**
   * Reads the content whose outer edges belong to the enclosing surface.
   *
   * @returns Current content element, or null to use the registered root.
   */
  readonly getContentElement?: () => HTMLElement | null;
}

/** Routes native hits between independently registered drag engines and document views. */
export class DropSurfaceRegistry<T extends DropSurface> {
  private readonly entries = new WeakMap<HTMLElement, DropSurfaceEntry<T>>();

  /**
   * Installs one receiving attachment without subscribing to input or owning its controller.
   *
   * A newer attachment replaces the previous one on the same root. Its identity
   * protects it from an older disposer. A failed marker write leaves the registry
   * unchanged. Receivers retain their own cancellation and feedback lifecycle.
   *
   * @param controller - Borrowed receiver and its existing DOM root.
   * @param getContentElement - Live displayed subtree boundary; omitted uses the root.
   * @returns Idempotent disposer removing only this attachment and its DOM marker.
   * @throws If the DOM marker cannot be written or removed.
   */
  register(controller: T, getContentElement?: () => HTMLElement | null): () => void {
    const entry = { controller, getContentElement };
    controller.root.setAttribute(DROP_SURFACE_ATTRIBUTE, "true");
    this.entries.set(controller.root, entry);
    return () => {
      if (this.entries.get(controller.root) === entry) {
        this.entries.delete(controller.root);
        controller.root.removeAttribute(DROP_SURFACE_ATTRIBUTE);
      }
    };
  }

  /**
   * Reads the current attachment for command-time identity validation.
   *
   * @param root - Exact receiving DOM root.
   * @returns Borrowed receiver, or undefined after removal or before registration.
   */
  get(root: HTMLElement): T | undefined {
    return this.entries.get(root)?.controller;
  }

  /**
   * Finds the closest registered document surface beneath the active pointer.
   *
   * Nested views remain eligible inside the source rectangle. Their top and bottom
   * edges belong to the enclosing surface, including padding outside a displayed
   * subtree. Only hit ancestors are visited; no document tree or rectangle cache
   * is maintained. Current native hits avoid a duplicate browser hit test.
   *
   * @param sourceRoot - Source occurrence, providing the browser document; null disables resolution.
   * @param pointer - Viewport X and Y coordinates in CSS pixels.
   * @param outerEdgeDropZone - Edge thickness in pixels; defaults to eight, capped at a third of content height.
   * @param nativeHit - Optional connected hit from the same browser document.
   * @returns Receiver and nested-boundary permission, or null outside registered surfaces.
   * @throws Propagates browser geometry and content-boundary lookup failures.
   */
  resolve(
    sourceRoot: HTMLElement | null,
    pointer: { readonly x: number; readonly y: number },
    outerEdgeDropZone = 8,
    nativeHit?: Element,
  ): DropSurfaceRoute<T> | null {
    const document = sourceRoot?.ownerDocument;
    const hit =
      nativeHit?.isConnected && nativeHit.ownerDocument === document
        ? nativeHit
        : document?.elementFromPoint(pointer.x, pointer.y);
    let root = hit?.closest<HTMLElement>(DROP_SURFACE_SELECTOR);
    let nestedBoundary = false;
    while (root) {
      const parent = root.parentElement?.closest<HTMLElement>(DROP_SURFACE_SELECTOR);
      if (!parent) {
        break;
      }
      const content = this.entries.get(root)?.getContentElement?.();
      const rect = (content ?? root).getBoundingClientRect();
      const edge = Math.min(Math.max(0, outerEdgeDropZone), rect.height / 3);
      if (pointer.y > rect.top + edge && pointer.y < rect.bottom - edge) {
        break;
      }
      nestedBoundary = true;
      root = parent;
    }
    const controller = root && this.get(root);
    return controller ? { controller, nestedBoundary } : null;
  }
}
