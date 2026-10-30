import { Listeners } from "@chulane/rivto-utils";
import type { BlockEditorResourceOwner } from "../../editor/extensions/block-editor-resource-owner";
import type { BlockRenderer, BlockRendererRegistration } from "./types";

/** Owns stable content components for one editor, independently of its data adapter. */
export class BlockRendererRegistry {
  private readonly components = new Map<string, BlockRendererRegistration>();
  private fallback: BlockRendererRegistration | undefined;
  private readonly listeners = new Listeners<{ changed: void }>();

  /**
   * Binds registrations and subscriptions to the editor's resource lifecycle.
   *
   * @param owner - Owner capturing registrations during extension setup.
   * @param fallbackRenderer - Optional stable component returned for unregistered types.
   */
  constructor(
    private readonly owner: BlockEditorResourceOwner,
    fallbackRenderer?: BlockRenderer,
  ) {
    this.fallback = fallbackRenderer ? Object.freeze({ content: fallbackRenderer }) : undefined;
    owner.registerCleanup(() => {
      this.fallback = undefined;
    });
  }

  /**
   * Installs a renderer for an unregistered nonempty block type.
   *
   * Renderer identity is retained until its disposer runs. Registration does not
   * change persisted block types or create definitions in the host's document.
   * If a publication listener fails, the new registration is removed before rethrowing.
   *
   * @param type - Persisted block type to associate with this component.
   * @param registration - Host content and optional layout; fields are captured at installation.
   * @returns Idempotent disposer removing this registration and notifying lookup consumers.
   * @throws If destroyed, the type is empty/registered, or a registry listener fails.
   */
  register(type: string, registration: BlockRendererRegistration): () => void {
    this.owner.assertActive();
    if (!type.trim() || this.components.has(type)) {
      throw new Error(`Invalid or duplicate block renderer type: ${type}`);
    }
    const dispose = this.owner.registerCleanup(() => {
      this.components.delete(type);
      this.notify();
    });
    this.components.set(type, Object.freeze({ ...registration }));
    try {
      this.notify();
    } catch (error) {
      try {
        dispose();
      } catch (cleanupError) {
        throw new AggregateError(
          [error, cleanupError],
          "Block editor registration rollback failed",
        );
      }
      throw error;
    }
    return dispose;
  }

  /**
   * Reads the retained registration identity without allocating a wrapper.
   *
   * @param type - Block type from the current host snapshot.
   * @returns Captured registration, stable fallback registration, or undefined when neither is installed.
   */
  get(type: string): BlockRendererRegistration | undefined {
    return this.components.get(type) ?? this.fallback;
  }

  /**
   * Observes registrations without subscribing to any document data.
   *
   * @param listener - Callback that rereads lookup results after a registry change.
   * @returns Idempotent disposer removing only this subscription.
   * @throws If the editor is destroyed.
   */
  subscribe(listener: () => void): () => void {
    this.owner.assertActive();
    const callback = () => listener();
    return this.owner.registerCleanup(this.listeners.subscribe("changed", callback));
  }

  /**
   * Notifies a captured list so disposal during delivery does not skip neighbors.
   *
   * @returns Every captured listener has been attempted.
   * @throws AggregateError containing listener failures after all notifications.
   */
  private notify(): void {
    this.listeners.emitAndCollectErrors("changed", "Block renderer notification failed");
  }
}
