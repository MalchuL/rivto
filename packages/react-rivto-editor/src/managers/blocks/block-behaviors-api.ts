import type { KeyboardSelectionTarget } from "../keyboard";
import type { BlockInput } from "@chulane/document-model";
import type {
  BlockBehavior,
  BlockBehaviorAction,
  BlockBehaviorContext,
  BlockBehaviorData,
} from "../../block-behaviors/types";
import type { BlockDropPlacement } from "@chulane/rivto-page";

/** Outline, split, and movement behavior selected from current detached block data. */
export interface BlockBehaviorsApi {
  /**
   * Selects the first declared placement policy for an owner's direct children.
   *
   * @param block - Current detached fields of the child-list owner.
   * @returns The first applicable policy, or undefined when all behaviors defer.
   */
  childDropPlacement(block: BlockBehaviorData): BlockDropPlacement | undefined;
  /** Revision of the installed behavior order, independent of document payload edits. */
  readonly revision: number;
  /**
   * Observes additions and removals that may change structural child visibility.
   *
   * @param listener - Callback rereading live behavior-dependent presentation.
   * @returns Idempotent disposer removing this subscription.
   */
  subscribe(listener: () => void): () => void;

  /**
   * Runs the context block's prioritized behavior chain until handled or rejected.
   *
   * This chain is for DOM-dependent actions. Core block operations independently
   * dispatch structural outline and deletion behaviors with the complete ID group.
   * The invoking interaction owns transaction batching and selection restoration.
   * A handled or rejected action claims the event; unhandled continues the chain.
   *
   * @param action - Semantic operation to invoke.
   * @param context - Block and panel in which the keyboard action originated.
   * @param target - Captured keyboard selection for the action.
   * @returns True when the operation was handled or explicitly rejected.
   * @throws If a behavior or delegated block operation fails.
   */
  dispatch(
    action: BlockBehaviorAction,
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): boolean;
  /**
   * Registers an instance whose isAvailable predicate determines applicability.
   * @param behavior - Instance reused by matching blocks; read per-block state from context.
   * @param priority - Finite order, default 0; larger values run first and ties keep registration order.
   * @returns Idempotent exact-registration disposer, also released with its extension.
   * @throws If priority is nonfinite or the runtime is destroyed.
   */
  register(behavior: BlockBehavior, priority?: number): () => void;
  /**
   * Selects applicable behaviors using current detached block fields.
   * @param block - Detached block data, without method names, discriminators, or movement arguments.
   * @returns Instances in descending priority, stable at ties; applicability is reevaluated on every call.
   */
  resolveAll(block: BlockInput): readonly BlockBehavior[];
  /**
   * Checks child visibility for rendering and traversal.
   * Rendering, navigation, selection, Enter/Delete, and drag previews use the same
   * query to agree on the visible outline. With no applicable visibility hooks,
   * children stay visible, including when the optional collapse extension is absent.
   * @param block - Persisted parent fields without requiring child subtrees.
   * @returns True unless an applicable behavior explicitly hides the children.
   */
  childrenVisible(block: BlockBehaviorData): boolean;
}
