import type { KeyboardSelectionTarget } from "../keyboard";
import type { BlockInput } from "@chulane/document-model";
import type { BlockRegistryManagerApi } from "@chulane/rivto";
import { RevisionStore } from "../../internal-store";
import { DefaultBlockBehavior } from "../../block-behaviors/default-block-behavior";
import type {
  BlockBehavior,
  BlockBehaviorAction,
  BlockBehaviorContext,
  BlockBehaviorData,
} from "../../block-behaviors/types";
import type { RegistrationOwner } from "../extensions/types";
import type { BlockBehaviorsApi } from "./block-behaviors-api";

/**
 * Stores ordered interaction behaviors selected by current detached block data.
 *
 * BlockTypeManager normally registers definition, renderer, and behavior together
 * with rollback if any registration fails. This registry also supports independent
 * behavior registration when a block type is already defined. Each behavior
 * determines its own applicability. The ordinary low-priority DefaultBlockBehavior
 * handles unknown types and operations not claimed by another registration.
 *
 * resolveAll() evaluates applicability using the same detached block data for every method.
 * No applicability is cached by type; the called method determines the operation.
 * The registry dispatches DOM-dependent keyboard actions, but does
 * not render blocks or keep per-block interaction state on behavior instances.
 */
export class BlockBehaviorRegistry implements BlockBehaviorsApi {
  private readonly store = new RevisionStore();
  private readonly registrations: Array<{
    readonly behavior: BlockBehavior;
    readonly priority: number;
  }> = [];
  private behaviors: readonly BlockBehavior[] = [];

  /**
   * Creates a context-aware registry and installs generic outline behavior as an ordinary registration.
   * @param extensions - Lifecycle owner releasing exact registrations during teardown.
   * @param blockRegistry - Core registry owning structural registrations for the same editor.
   */
  constructor(
    private readonly extensions: RegistrationOwner,
    private readonly blockRegistry: Pick<BlockRegistryManagerApi, "registerBehavior">,
  ) {
    extensions.registerCleanup(() => this.store.clear());
    this.register(new DefaultBlockBehavior(), -1000);
  }

  /**
   * Registers an instance whose isAvailable predicate selects its blocks independently of method names.
   * Larger priorities run first; equal priorities preserve registration order.
   * @param behavior - Instance whose omitted action methods defer to later registrations.
   * @param priority - Finite ordering value, defaulting to 0; built-in generic handling uses -1000.
   * @returns Idempotent disposer removing only this registration, also owned by the registering extension.
   * @throws If priority is nonfinite or the runtime is destroyed.
   */
  register(behavior: BlockBehavior, priority = 0): () => void {
    this.extensions.assertActive();
    if (!Number.isFinite(priority)) {
      throw new Error("Block behavior priority must be finite");
    }
    const unregisterStructural = this.blockRegistry.registerBehavior(behavior, priority);
    const registration = { behavior, priority };
    this.registrations.push(registration);
    this.sortRegistrations();
    let dispose: () => void;
    try {
      dispose = this.extensions.registerCleanup(() => {
        unregisterStructural();
        const index = this.registrations.indexOf(registration);
        if (index >= 0) {
          this.registrations.splice(index, 1);
          this.sortRegistrations();
          this.store.changed();
        }
      });
    } catch (error) {
      unregisterStructural();
      this.registrations.splice(this.registrations.indexOf(registration), 1);
      this.sortRegistrations();
      throw error;
    }
    try {
      this.store.changed();
    } catch (error) {
      try {
        dispose();
      } catch (cleanupError) {
        throw new AggregateError([error, cleanupError], "Behavior publication and rollback failed");
      }
      throw error;
    }
    return dispose;
  }

  /**
   * Reads the revision used to invalidate structural presentation snapshots.
   *
   * @returns The current registration revision, unchanged by document edits.
   */
  get revision(): number {
    return this.store.revision;
  }

  /**
   * Observes installed behavior changes without owning the registry lifecycle.
   *
   * @param listener - Callback rereading behavior-dependent presentation.
   * @returns Idempotent disposer removing only this listener.
   */
  subscribe(listener: () => void): () => void {
    return this.store.subscribe(listener);
  }

  /**
   * Evaluates each registered behavior against the supplied detached block and runtime.
   * @param block - Current detached block fields, without method names or movement arguments.
   * @returns Applicable instances in priority order. Results are reevaluated, never cached by type.
   */
  resolveAll(block: BlockInput): readonly BlockBehavior[] {
    return this.behaviors.filter((behavior) => behavior.isAvailable(block));
  }

  /**
   * Resolves direct-child boundary placement using the existing behavior priority.
   *
   * @param block - Current detached fields of the child-list owner.
   * @returns The first declared policy, or undefined when all behaviors defer.
   */
  childDropPlacement(block: BlockBehaviorData): "outline" | "siblings" | undefined {
    for (const behavior of this.resolveAll(block)) {
      const placement = behavior.childDropPlacement?.(block);
      if (placement !== undefined) {
        return placement;
      }
    }
    return undefined;
  }

  /**
   * Resolves applicability and continues until an action is handled or explicitly refused.
   *
   * This registry owns DOM-dependent keyboard actions and presentation policies.
   * Structural outline and deletion operations use the core block manager instead,
   * with their own parent interception, priority ordering, and panel boundaries.
   * The invoking extension owns transaction batching and selection restoration.
   *
   * The action name determines the accepted argument tuple from BlockBehavior.
   * Its first argument identifies the block whose behavior chain is requested.
   * A true result tells the caller to stop further handling, even when the document
   * did not change: explicit rejection and a handled no-op both claim the action.
   *
   * @param action - Semantic operation requested by a keyboard or selection extension.
   * @param context - Block and panel receiving the action within the caller’s transaction.
   * @param target - Keyboard selection used by the selected behavior.
   * @returns True when a behavior handles or rejects the requested operation;
   * false when every applicable handler is absent or defers.
   * @throws If context resolution, availability predicates, action handlers or delegated mutations fail.
   */
  dispatch(
    action: BlockBehaviorAction,
    context: BlockBehaviorContext,
    target: KeyboardSelectionTarget,
  ): boolean {
    // An explicit rejection claims the key just like a handled action; only deferral continues.
    for (const behavior of this.behaviors) {
      const handler = behavior[action];
      if (
        handler &&
        behavior.isAvailable(context.block) &&
        handler.call(behavior, context, target) !== "unhandled"
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks whether every applicable visibility predicate permits the block's children.
   * @param block - Persisted parent data, without requiring child subtree reads.
   * @returns True unless an applicable behavior explicitly hides the children.
   */
  childrenVisible(block: BlockBehaviorData): boolean {
    return this.behaviors.every(
      (behavior) =>
        !behavior.childrenVisible ||
        !behavior.isAvailable(block) ||
        behavior.childrenVisible(block) !== false,
    );
  }

  /**
   * Rebuilds action priority order only when registrations change.
   *
   * Sorts stored registrations and caches their ordered behavior instances without
   * evaluating applicability. Equal-priority registrations retain their order.
   *
   * @returns No value; later dispatch and queries use the updated priority order.
   */
  private sortRegistrations(): void {
    this.registrations.sort((left, right) => right.priority - left.priority);
    this.behaviors = this.registrations.map(({ behavior }) => behavior);
  }
}
