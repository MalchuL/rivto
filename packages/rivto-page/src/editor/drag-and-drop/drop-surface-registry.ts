import type { BlockDragHit, BlockDropSurfaceEntry, BlockDropSurfaceRoot } from "./types";

/** Attribute identifying mounted receivers independently of the source drag engine. */
export const DROP_SURFACE_ATTRIBUTE = "data-rivto-cross-document-page-root";
const DROP_SURFACE_SELECTOR = `[${DROP_SURFACE_ATTRIBUTE}]`;

/** Routes opaque hits between independently registered drag engines and document views. */
export class DropSurfaceRegistry<T extends object> {
  private readonly entries = new WeakMap<object, BlockDropSurfaceEntry<T>>();
  private readonly registrations = new WeakMap<object, BlockDropSurfaceEntry<T>>();

  /**
   * Installs one receiving attachment without subscribing to input or owning its controller.
   *
   * A newer attachment replaces the previous one on the same root. Its identity
   * protects it from an older disposer. A failed marker write leaves the registry
   * unchanged. Receivers retain their own cancellation and feedback lifecycle.
   *
   * @param root - Root capability for the mounted receiving occurrence.
   * @param controller - Borrowed receiver identity.
   * @returns Idempotent disposer removing only this attachment and its DOM marker.
   * @throws If the Root lacks a current identity, changes during setup, or its marker cleanup fails.
   */
  register(root: BlockDropSurfaceRoot, controller: T): () => void {
    const identity = root.getElementIdentity?.();
    if (!identity || !root.isAttached()) {
      throw new Error("Drop surface requires an attached Root identity");
    }
    const releaseMarker = root.setTemporaryAttribute(DROP_SURFACE_ATTRIBUTE, "true");
    let current: boolean;
    try {
      current = root.isAttached() && root.getElementIdentity?.() === identity && root.isAttached();
    } catch (error) {
      try {
        releaseMarker();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Drop surface registration failed");
      }
      throw error;
    }
    if (!current) {
      const error = new Error("Drop surface Root changed during registration");
      try {
        releaseMarker();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Drop surface registration failed");
      }
      throw error;
    }
    const entry = { controller, root, identity };
    this.entries.set(identity, entry);
    this.registrations.set(controller, entry);
    return () => {
      if (this.registrations.get(controller) === entry) {
        this.registrations.delete(controller);
      }
      if (this.entries.get(identity) === entry) {
        this.entries.delete(identity);
      }
      releaseMarker();
    };
  }

  /**
   * Resolves a receiver only while its exact registration remains connected and current.
   *
   * @param controller - Previously returned receiver identity.
   * @returns The registered receiver, or undefined after replacement, release or disconnection.
   * @throws Propagates Root connectivity and attachment-check failures.
   */
  getCurrent(controller: object): T | undefined {
    const entry = this.registrations.get(controller);
    if (!entry || this.entries.get(entry.identity) !== entry || !entry.root.isConnected()) {
      return undefined;
    }
    return this.entries.get(entry.identity) === entry &&
      this.registrations.get(controller) === entry
      ? entry.controller
      : undefined;
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
   * The caller supplies a hit already checked against its source document; this
   * registry never performs a second hit test.
   * A receiver registered again on another root is resolved only at its latest
   * registration, even before the old root's disposer runs.
   *
   * @param hit - Current connected browser hit, or undefined outside a surface.
   * @returns Closest registered receiver, or null outside registered surfaces.
   * @throws Propagates hit traversal and Root attachment-check failures.
   */
  resolve(hit?: BlockDragHit): T | null {
    const identity = hit?.getNearestAncestorIdentity(DROP_SURFACE_SELECTOR);
    const entry = identity ? this.entries.get(identity) : undefined;
    if (!entry || this.registrations.get(entry.controller) !== entry) {
      return null;
    }
    return this.getCurrent(entry.controller) ?? null;
  }
}
