/**
 * Registry of per-type block views with a shared generic fallback.
 *
 * Storage is independent from renderers so a losslessly loaded unknown type
 * still receives {@link BaseBlockView}. Normal custom blocks register a view
 * through {@link BlockManager.register} alongside their definition.
 *
 * @module
 */
import type { ReactEditorImpl } from "../../react-editor";
import { BaseBlockView } from "../../views/base-view";
import type { BlockViewBehavior } from "../../views/types";
import type { ViewsCapability } from "../../capabilities";

/** Shared fallback used for unregistered and unknown block types. */
const defaultBlockView = new BaseBlockView();

/**
 * Owns React block-view instances indexed by persisted block type.
 */
export class ViewManager implements ViewsCapability {
  private readonly views = new Map<string, {
    readonly view: BlockViewBehavior;
    dispose: () => void;
  }>();

  /**
   * Creates a view registry bound to one React runtime.
   *
   * @param reactEditor - Complete owning runtime used for lifecycle ownership.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /**
   * Registers one behavior object for a unique non-empty block type.
   *
   * @param type - Persisted block type resolved by dispatchers.
   * @param view - Behavior instance consulted for that type.
   * @returns Idempotent disposer removing this exact view.
   */
  register(type: string, view: BlockViewBehavior): () => void {
    this.reactEditor.extensions.assertActive();
    if (!type.trim()) throw new Error("Block view type is required");
    if (this.views.has(type)) throw new Error(`Block view ${type} is already registered`);
    const registration: {
      readonly view: BlockViewBehavior;
      dispose: () => void;
    } = {
      view,
      dispose: () => undefined,
    };
    this.views.set(type, registration);
    registration.dispose = this.reactEditor.extensions.own(() => {
      if (this.views.get(type) !== registration) return;
      this.views.delete(type);
    });
    return registration.dispose;
  }

  /**
   * Deletes the exact view registered for a block type.
   *
   * @param type - Persisted block type whose view is removed.
   * @returns `true` when a view existed and was disposed.
   */
  delete(type: string): boolean {
    this.reactEditor.extensions.assertActive();
    const registration = this.views.get(type);
    if (!registration) return false;
    registration.dispose();
    return true;
  }

  /**
   * Returns the registered view for a type, or `undefined` when absent.
   *
   * @param type - Persisted block type to resolve.
   * @returns The registered instance, without falling back to the generic view.
   */
  get(type: string): BlockViewBehavior | undefined {
    return this.views.get(type)?.view;
  }

  /**
   * Reports whether an exact type view is registered, excluding the fallback.
   *
   * @param type - Persisted block type to inspect.
   * @returns `true` when this manager owns a view for that type.
   */
  has(type: string): boolean {
    return this.views.has(type);
  }

  /**
   * Resolves the view that should handle one placed block.
   *
   * Unknown or unregistered types receive the shared {@link BaseBlockView}.
   *
   * @param blockId - Placed block whose type selects the view.
   * @returns A specialized view or the shared generic fallback.
   */
  resolve(blockId: string): BlockViewBehavior {
    const type = this.reactEditor.editor.blocks.getBlock(blockId)?.type;
    return (type && this.views.get(type)?.view) || this.fallback;
  }

  /**
   * Asks a resolved target view whether it accepts dragged roots.
   *
   * @param targetId - Block that would receive or sit beside the drop.
   * @param sourceIds - Subtree roots being moved.
   * @returns Whether the shared drag resolver may use this destination.
   */
  acceptsDrop(targetId: string, sourceIds: readonly string[]): boolean {
    return this.resolve(targetId).acceptsDrop({
      reactEditor: this.reactEditor,
      targetId,
      sourceIds,
    });
  }

  /** Shared generic view used when a type registers no specialization. */
  get fallback(): BaseBlockView {
    return defaultBlockView;
  }

}
