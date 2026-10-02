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
import type { EditorBlock } from "@chulane/rivto";
import type { BlockDropDestination, BlockViewBehavior } from "../../views/types";
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
   * @param reactEditor - Owning React runtime providing blocks and extension lifecycle.
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
    const type = this.reactEditor.blocks.getBlockNode(blockId)?.type;
    return (type && this.views.get(type)?.view) || this.fallback;
  }

  /**
   * Validates all moved roots against their actual destination parent.
   *
   * Checks the parent's allowed child types and each source view's allowed
   * parent types before consulting the destination view's acceptance hook.
   * Root-level destinations use the generic fallback view.
   *
   * @param destination - Canonical gap or container receiving the moved roots.
   * @param sources - Source blocks whose types and content must be accepted.
   * @returns `true` when sources are non-empty, the destination parent exists
   * when specified, and all type restrictions and the acceptance hook pass.
   */
  acceptsDrop(destination: BlockDropDestination, sources: readonly EditorBlock[]): boolean {
    const parent = destination.parentId
      ? this.reactEditor.blocks.getBlock(destination.parentId)
      : undefined;
    if (destination.parentId && !parent) return false;
    const view = parent ? this.resolve(parent.id) : this.fallback;
    return sources.length > 0 && sources.every((source) => {
      const sourceView = this.get(source.type) ?? this.fallback;
      return (!view.dropChildTypes || view.dropChildTypes.includes(source.type))
        && (!sourceView.dropParentTypes || Boolean(parent && sourceView.dropParentTypes.includes(parent.type)));
    }) && view.acceptsDrop({ reactEditor: this.reactEditor, destination, sources });
  }

  /** Shared generic view used when a type registers no specialization. */
  get fallback(): BaseBlockView {
    return defaultBlockView;
  }

}
