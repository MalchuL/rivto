import { dispatchBlockAction } from "../../block-behaviors/utils/dispatch";
import { DefaultBlockBehavior } from "../../block-behaviors/default-block-behavior";
import type {
  BlockBehavior,
  BlockBehaviorAction,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorData,
  BlockMoveContext,
} from "../../block-behaviors/types";
import type { ReactEditorApi } from "../../editor/types";
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
 * resolveAll() evaluates applicability using the same editor and block context for every method.
 * No applicability is cached by type; the called method determines the operation.
 * The registry dispatches keyboard actions and checks semantic move destinations, but does
 * not render blocks or keep per-block interaction state on behavior instances.
 */
export class BlockBehaviorRegistry implements BlockBehaviorsApi {
  private readonly registrations: Array<{
    readonly behavior: BlockBehavior;
    readonly priority: number;
  }> = [];
  private behaviors: readonly BlockBehavior[] = [];

  /**
   * Creates a context-aware registry and installs generic outline behavior as an ordinary registration.
   * @param reactEditor - Owning runtime supplying current blocks and property policies.
   * @param extensions - Lifecycle owner releasing exact registrations during teardown.
   */
  constructor(
    private readonly reactEditor: ReactEditorApi,
    private readonly extensions: RegistrationOwner,
  ) {
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
    const registration = { behavior, priority };
    this.registrations.push(registration);
    this.sortRegistrations();
    return this.extensions.registerCleanup(() => {
      const index = this.registrations.indexOf(registration);
      if (index >= 0) {
        this.registrations.splice(index, 1);
        this.sortRegistrations();
      }
    });
  }

  /**
   * Evaluates each registered behavior against the supplied detached block and runtime.
   * @param context - Current detached block fields and runtime, without method names or movement arguments.
   * @returns Applicable instances in priority order. Results are reevaluated, never cached by type.
   */
  resolveAll(context: BlockBehaviorAvailabilityContext): readonly BlockBehavior[] {
    return this.behaviors.filter((behavior) => behavior.isAvailable(context));
  }

  /**
   * Resolves applicability and continues until an action is handled or explicitly refused.
   * @param action - Semantic operation requested by a keyboard or selection extension.
   * @param args - Existing action context and operation-specific arguments; the caller owns its transaction.
   * @returns True when a behavior handles or rejects the requested operation.
   */
  dispatch<Action extends BlockBehaviorAction>(
    action: Action,
    ...args: Parameters<NonNullable<BlockBehavior[Action]>>
  ): boolean {
    const context: BlockBehaviorAvailabilityContext = {
      editor: this.reactEditor,
      block: args[0].block,
    };
    return dispatchBlockAction(this.behaviors, context, action, ...args);
  }

  /**
   * Checks whether every applicable visibility predicate permits the block's children.
   * @param block - Persisted parent data, without requiring child subtree reads.
   * @returns True unless an applicable behavior explicitly hides the children.
   */
  childrenVisible(block: BlockBehaviorData): boolean {
    const context: BlockBehaviorAvailabilityContext = {
      editor: this.reactEditor,
      block,
    };
    return this.behaviors.every(
      (behavior) =>
        !behavior.childrenVisible ||
        !behavior.isAvailable(context) ||
        behavior.childrenVisible(block) !== false,
    );
  }

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
  canMove(request: Pick<BlockMoveContext, "sources" | "destination">): boolean {
    const { sources, destination } = request;
    const parent =
      destination.parentId === null
        ? null
        : this.reactEditor.blocks.getBlockNode(destination.parentId);
    if (!sources.length || (destination.parentId !== null && !parent)) {
      return false;
    }
    if (
      destination.beforeId !== undefined &&
      (!this.reactEditor.blocks.getBlockNode(destination.beforeId) ||
        this.reactEditor.blocks.getParentId(destination.beforeId) !== destination.parentId)
    ) {
      return false;
    }
    const moveContext: BlockMoveContext = {
      ...request,
      editor: this.reactEditor,
      parent: parent ?? null,
    };
    const blocks = parent ? [...sources, parent] : sources;
    const availabilityContexts = blocks.map((block) => ({ editor: this.reactEditor, block }));
    return this.behaviors.every(
      (behavior) =>
        !behavior.canMove ||
        !availabilityContexts.some((context) => behavior.isAvailable(context)) ||
        behavior.canMove(moveContext) !== false,
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
