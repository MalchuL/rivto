import {
  createBlockBehaviorContext,
  createBlockOutlineContext,
} from "../../block-behaviors/utils/context";
import { DefaultBlockBehavior } from "../../block-behaviors/default-block-behavior";
import type {
  BlockBehavior,
  BlockBehaviorAction,
  BlockBehaviorAvailabilityContext,
  BlockBehaviorContext,
  BlockBehaviorData,
  BlockBehaviorOutcome,
  BlockMoveContext,
  BlockOutlineContext,
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
   *
   * Indent and outdent first run the live parent's child-operation chain with the
   * complete requested ID group and the parent's shallow context. Only deferral
   * reaches the leading child's chain. Handled or rejected stops both chains;
   * missing parents skip interception. The caller owns the transaction boundary.
   * Parent handlers use this same dispatch method without traversing grandparents:
   * only onIndent and onOutdent request a parent interception.
   * Structural deletion visits the complete requested group in its supplied order,
   * consulting each distinct applicable behavior only on its first selected block.
   * A handled or rejected outcome claims the whole group; generic deletion remains
   * with the selection extension when every applicable handler defers.
   *
   * The action name determines the accepted argument tuple from BlockBehavior.
   * Its first argument identifies the block whose behavior chain is requested;
   * outline and structural-delete handlers also receive the complete ID group.
   * A true result tells the caller to stop further handling, even when the document
   * did not change: explicit rejection and a handled no-op both claim the action.
   *
   * @param action - Semantic operation requested by a keyboard or selection extension.
   * @param args - Existing action context and operation-specific arguments; the caller owns its transaction.
   * @returns True when a behavior handles or rejects the requested operation;
   * false when no parent claims it and every applicable handler is absent or defers.
   * @throws If context resolution, availability predicates, action handlers or delegated mutations fail.
   */
  dispatch<Action extends BlockBehaviorAction>(
    action: Action,
    ...args: Parameters<NonNullable<BlockBehavior[Action]>>
  ): boolean {
    // Let the direct parent govern changes to its children's outline first:
    // a column can forbid lifting its content out even if the child allows outdent.
    if (action === "onIndent" || action === "onOutdent") {
      // Both methods accept [outline context, requested IDs]. TypeScript does not
      // narrow the generic argument tuple from the action check, hence this cast.
      const [context, ids] = args as [BlockOutlineContext, readonly string[]];
      // The caller's context.parentId may predate a move. Resolve the live parent
      // while preserving the selection captured for this operation.
      const parentId = context.reactPanel.blocks.getParentId(context.block.id);
      // Parent hooks receive the parent's shallow fields and the original selection.
      // Root blocks and missing parents skip interception without blocking the child.
      const parentContext = parentId
        ? createBlockOutlineContext(context.reactPanel, parentId, context.selection)
        : undefined;
      // onChildIndent/onChildOutdent skip this branch, so this nested dispatch
      // consults only the direct parent. IDs still identify the original child group.
      // A handled or rejected parent action stops the child's chain entirely.
      if (
        parentContext &&
        this.dispatch(
          // Choose parent action "onChildIndent" or "onChildOutdent"
          action === "onIndent" ? "onChildIndent" : "onChildOutdent",
          parentContext,
          ids,
        )
      ) {
        // true includes an explicit refusal: do not let the child's generic handler
        // perform the move after the parent has rejected it or already handled it.
        return true;
      }
    }
    // For outline actions, continuing here means the parent was absent or every
    // applicable parent hook deferred; the original child's chain can now run.
    // A structural selection can span several block types. Consult distinct
    // behaviors across the complete group before allowing generic deletion.
    if (action === "onStructuralDelete") {
      const [context, ids] = args as [BlockBehaviorContext, readonly string[]];
      // A behavior consulted for an earlier block is skipped for later blocks; every
      // handler gets the full group. A false result leaves generic deletion to the caller.
      return this.dispatchStructuralDelete(context, ids);
    }
    // Run applicable handlers for the context block in priority order. The generic
    // DefaultBlockBehavior participates as an ordinary low-priority registration.
    return this.dispatchBlockAction(this.behaviors, args[0].block, action, ...args);
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
   * Invokes an ordered behavior chain until a behavior handles or explicitly rejects the operation.
   *
   * The dispatcher resolves the supplied ordered chain against the context block
   * and calls the requested semantic method. Applicability is checked immediately
   * before invoking a handler, using this registry's runtime and detached block
   * fields without method names. Inherited methods are called normally, without
   * fallback exceptions. `unhandled` is the only outcome that continues to later
   * applicable registrations. The caller owns the transaction boundary.
   *
   * @param behaviors - Registered behaviors in descending priority order, possibly a selected subset.
   * @param block - Detached fields used for applicability, preserving shallow selection reads.
   * @param action - Semantic method to invoke.
   * @param args - Arguments accepted by that method, starting with its block context.
   * @returns True when a behavior handles or explicitly rejects the operation;
   * false when every applicable handler defers or is absent.
   * @throws If an availability predicate, action handler, or delegated operation fails.
   */
  private dispatchBlockAction<Action extends BlockBehaviorAction>(
    behaviors: readonly BlockBehavior[],
    block: BlockBehaviorData,
    action: Action,
    ...args: Parameters<NonNullable<BlockBehavior[Action]>>
  ): boolean {
    const context: BlockBehaviorAvailabilityContext = {
      editor: this.reactEditor,
      block,
    };
    for (const behavior of behaviors) {
      const handler = behavior[action];
      if (!handler || !behavior.isAvailable(context)) {
        continue;
      }
      const outcome = (
        handler as (
          ...values: Parameters<NonNullable<BlockBehavior[Action]>>
        ) => BlockBehaviorOutcome
      ).call(behavior, ...args);
      if (outcome !== "unhandled") {
        return true;
      }
    }
    return false;
  }

  /**
   * Consults distinct structural-deletion behaviors across the complete selected group.
   *
   * Selected IDs are visited in their supplied order and unknown IDs are skipped.
   * Each block contributes only handlers not consulted for an earlier block; the
   * first handled or rejected outcome claims the whole selection. Full snapshots
   * are read only for blocks introducing handlers, reusing the initial context for
   * its block. Every handler receives the complete ID group and captured selection.
   * This method invokes policy only; generic deletion, batching and focus remain
   * with the selection caller when all handlers defer.
   *
   * @param initialContext - Selected block context supplying the live panel, DOM root and captured selection.
   * @param ids - Complete structural selection in its existing order, without normalization.
   * @returns True when a handler claims the whole group; false for empty or missing groups or universal deferral.
   * @throws If context resolution, availability predicates or action handlers fail.
   */
  private dispatchStructuralDelete(
    initialContext: BlockBehaviorContext,
    ids: readonly string[],
  ): boolean {
    const { reactPanel, root, selection } = initialContext;
    const seen = new Set<BlockBehavior>();
    for (const id of ids) {
      const block = reactPanel.blocks.getBlockNode(id);
      if (!block) {
        continue;
      }
      const behaviors = this.resolveAll({ editor: this.reactEditor, block }).filter(
        (behavior) => behavior.onStructuralDelete && !seen.has(behavior),
      );
      if (!behaviors.length) {
        continue;
      }
      const context =
        id === initialContext.block.id
          ? initialContext
          : createBlockBehaviorContext(reactPanel, id, root, selection);
      if (!context) {
        continue;
      }
      behaviors.forEach((behavior) => seen.add(behavior));
      if (this.dispatchBlockAction(behaviors, block, "onStructuralDelete", context, ids)) {
        return true;
      }
    }
    return false;
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
