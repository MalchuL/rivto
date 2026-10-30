/** Attribute identifying mounted receivers independently of the source drag engine. */
export const DROP_SURFACE_ATTRIBUTE = "data-rivto-cross-document-page-root";
const DROP_SURFACE_SELECTOR = `[${DROP_SURFACE_ATTRIBUTE}]`;

/** The registry borrows DOM identity; it never owns document data or commands. */
export interface DropSurface {
  readonly root: HTMLElement;
}

/** One registration identity, retained even when the same controller is registered twice. */
interface DropSurfaceEntry<T extends DropSurface> {
  readonly controller: T;
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
   * @returns Idempotent disposer removing only this attachment and its DOM marker.
   * @throws If the DOM marker cannot be written or removed.
   */
  register(controller: T): () => void {
    const entry = { controller };
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
   * The closest registered occurrence owns its complete hit surface, including
   * its declared edge regions. No geometry redirects a hit to an enclosing
   * editor. To target the enclosing editor, the pointer must hit one of its own
   * mounted regions outside the nested occurrence. Only hit ancestors are read;
   * the registry does not maintain a document tree or rectangle cache.
   *
   * @param sourceRoot - Source occurrence, providing the browser document; null disables resolution.
   * @param pointer - Viewport X and Y coordinates in CSS pixels.
   * @param nativeHit - Optional connected hit from the same browser document.
   * @returns Closest registered receiver, or null outside registered surfaces.
   * @throws Propagates native hit-testing or DOM traversal failures.
   */
  resolve(
    sourceRoot: HTMLElement | null,
    pointer: { readonly x: number; readonly y: number },
    nativeHit?: Element,
  ): T | null {
    const document = sourceRoot?.ownerDocument;
    const hit =
      nativeHit?.isConnected && nativeHit.ownerDocument === document
        ? nativeHit
        : document?.elementFromPoint(pointer.x, pointer.y);
    const root = hit?.closest<HTMLElement>(DROP_SURFACE_SELECTOR);
    return root ? (this.get(root) ?? null) : null;
  }
}
