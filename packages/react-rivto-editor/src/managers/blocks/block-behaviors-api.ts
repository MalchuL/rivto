import type {
  BlockBehavior,
  BlockBehaviorAction,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorData,
  BlockMoveContext,
} from "../../block-behaviors/types";

/** Outline, split, and movement behavior selected from current detached block data. */
export interface BlockBehaviorsApi {
  /**
   * Runs the context block's prioritized behavior chain until handled or rejected.
   *
   * Indent and outdent dispatch the corresponding child-operation handler on the
   * live parent first, then continue with the context block only on deferral.
   * Parent interception is one level deep and preserves the full requested ID
   * group and captured selection. The caller owns transaction batching.
   * Structural deletion visits the complete supplied group in its existing order.
   * Behaviors already consulted for one selected block are skipped for later ones;
   * every handler receives the full group. Missing IDs are ignored and the first
   * handled or rejected outcome claims the whole selection. Universal deferral
   * returns false so the caller can perform generic deletion.
   *
   * @param action - Semantic operation to invoke.
   * @param args - Block context and operation-specific arguments.
   * @returns True when the operation was handled or explicitly rejected.
   * @throws If a behavior or delegated block operation fails.
   */
  dispatch<Action extends BlockBehaviorAction>(
    action: Action,
    ...args: Parameters<NonNullable<BlockBehavior[Action]>>
  ): boolean;
  /**
   * Registers an instance whose isAvailable context determines applicability.
   * @param behavior - Instance reused by matching blocks; read per-block state from context.
   * @param priority - Finite order, default 0; larger values run first and ties keep registration order.
   * @returns Idempotent exact-registration disposer, also released with its extension.
   * @throws If priority is nonfinite or the runtime is destroyed.
   */
  register(behavior: BlockBehavior, priority?: number): () => void;
  /**
   * Selects applicable behaviors using current detached block fields and runtime.
   * @param context - Common editor and block context, without method names, discriminators, or movement arguments.
   * @returns Instances in descending priority, stable at ties; applicability is reevaluated on every call.
   */
  resolveAll(context: BlockBehaviorAvailabilityContext): readonly BlockBehavior[];
  /**
   * Checks child visibility for rendering and traversal.
   * Rendering, navigation, selection, Enter/Delete, and drag previews use the same
   * query to agree on the visible outline. With no applicable visibility hooks,
   * children stay visible, including when the optional collapse extension is absent.
   * @param block - Persisted parent fields without requiring child subtrees.
   * @returns True unless an applicable behavior explicitly hides the children.
   */
  childrenVisible(block: BlockBehaviorData): boolean;
  /**
   * Checks semantic movement independently of its keyboard or pointer origin.
   * Source data is used directly, including foreign-document snapshots. The receiving
   * parent is read once. The common availability predicate checks sources and parent; each
   * matching registration calls canMove at most once, in priority order, stopping at the first veto.
   * All applicable hooks must permit the move. This does not
   * replace core hierarchy validation or mutate the document.
   * @param request - Nonempty moved roots and a core insertion destination.
   * @returns False for empty sources, a missing parent or insertion neighbor, or a hook veto.
   */
  canMove(request: Pick<BlockMoveContext, "sources" | "destination">): boolean;
}
