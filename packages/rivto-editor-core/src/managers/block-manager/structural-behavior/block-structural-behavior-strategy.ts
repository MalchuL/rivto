import type { BlockRegistryManager } from "../../block-registry-manager/block-registry-manager";
import {
  validateBlockForest,
  type BlockDestination,
  type BlockInput,
} from "@chulane/document-model";
import type { EditorBlockNode } from "../../../editor/model";
import type { BlockManagerApi } from "../../types";
import type {
  BlockChildTransition,
  BlockMoveRequest,
  BlockRelocationCommands,
  BlockStructuralBehavior,
  BlockStructuralContext,
  BlockStructuralScope,
} from "../../../block-behaviors/types";

/** Structural operations borrowed by document and panel block managers. */
export type StructuralBehaviorRegistry = Pick<
  BlockRegistryManager,
  "getBehaviorRegistrations" | "dispatchBehavior"
>;

/** Ordered editor-local strategies for structural block operations. */
export class BlockStructuralBehaviorStrategy {
  /**
   * Borrows block reads and commands for behavior contexts and destination checks.
   *
   * @param blocks - Owning manager; this strategy never destroys it.
   * @param registry - Editor-local ordered registrations, borrowed without lifecycle ownership.
   * @param documentBlocks - Document-wide operations used by behaviors across panel boundaries.
   */
  constructor(
    private readonly blocks: BlockStructuralScope &
      Pick<BlockManagerApi, "getInsertionDestinationAfter">,
    private readonly registry: StructuralBehaviorRegistry,
    private readonly documentBlocks: BlockRelocationCommands,
  ) {}

  /**
   * Evaluates editor-owned movement policies against sources and destination.
   *
   * Foreign source records are inspected directly, without resolving their IDs locally.
   *
   * @param request - Nonempty detached source roots and the destination location.
   * @returns False for a missing destination, invalid neighbor, or a behavior veto.
   */
  canMove(request: BlockMoveRequest): boolean {
    const { sources, destination } = request;
    const parent =
      destination.parentId === null ? null : this.blocks.getBlockNode(destination.parentId);
    if (!sources.length || (destination.parentId !== null && !parent)) {
      return false;
    }
    if (
      destination.beforeId !== undefined &&
      (!this.blocks.getBlockNode(destination.beforeId) ||
        this.blocks.getParentId(destination.beforeId) !== destination.parentId)
    ) {
      return false;
    }
    const candidates = parent ? [...sources, parent] : sources;
    return this.registry
      .getBehaviorRegistrations()
      .every(
        ({ behavior }) =>
          !behavior.canMove ||
          !candidates.some((block) => behavior.isAvailable(block)) ||
          behavior.canMove({ sources, destination, parent: parent ?? null }) !== false,
      );
  }

  /**
   * Runs parent and child outline behaviors before applying the standard operation.
   *
   * @param action - Requested outline direction.
   * @param ids - Complete requested group led by its active block.
   * @returns Whether the leading block is missing, a behavior claimed the request, or all deferred.
   * @throws If a behavior or delegated operation fails.
   */
  interceptOutline(
    action: "indent" | "outdent",
    ids: string[],
  ): "missing" | "handled" | "unhandled" {
    const block = ids[0] ? this.blocks.getBlockNode(ids[0]) : undefined;
    if (!block) {
      return "missing";
    }
    const parentId = this.blocks.getParentId(block.id) ?? null;
    const context: BlockStructuralContext = {
      blocks: this.blocks,
      documentBlocks: this.documentBlocks,
      block,
      parentId,
    };
    const parent = parentId ? this.blocks.getBlockNode(parentId) : undefined;
    const parentContext = parent
      ? { ...context, block: parent, parentId: this.blocks.getParentId(parent.id) ?? null }
      : undefined;
    const parentAction = action === "indent" ? "onChildIndent" : "onChildOutdent";
    const blockAction = action === "indent" ? "onIndent" : "onOutdent";
    if (
      (parentContext && this.registry.dispatchBehavior(parentAction, parentContext, ids)) ||
      this.registry.dispatchBehavior(blockAction, context, ids)
    ) {
      return "handled";
    }
    return "unhandled";
  }

  /**
   * Lets each matching behavior claim a structural deletion once per group.
   *
   * @param ids - Selected block IDs in their original order.
   * @returns True if a behavior handled or rejected the group.
   * @throws If an availability predicate or deletion handler fails.
   */
  interceptDeletion(ids: readonly string[]): boolean {
    if (
      !this.registry.getBehaviorRegistrations().some(({ behavior }) => behavior.onStructuralDelete)
    ) {
      return false;
    }
    const consulted = new Set<BlockStructuralBehavior>();
    for (const id of ids) {
      const block = this.blocks.getBlockNode(id);
      if (!block) {
        continue;
      }
      const context: BlockStructuralContext = {
        blocks: this.blocks,
        documentBlocks: this.documentBlocks,
        block,
        parentId: this.blocks.getParentId(id) ?? null,
      };
      if (this.registry.dispatchBehavior("onStructuralDelete", context, ids, consulted)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Runs editor-local pure transformations for one direct-parent transition.
   *
   * @param transition - Detached child and its old and new direct parents.
   * @returns Transformed child; identity and hierarchy remain unchanged.
   * @throws If a processor changes identity, type, or descendants, or returns invalid data.
   */
  processChildTransition(transition: BlockChildTransition): BlockInput {
    let child = transition.child;
    for (const [parent, action] of [
      [transition.previousParent, "onChildExit"],
      [transition.nextParent, "onChildEnter"],
    ] as const) {
      if (!parent) {
        continue;
      }
      for (const { behavior } of this.registry.getBehaviorRegistrations()) {
        if (behavior[action] && behavior.isAvailable(parent)) {
          const next = behavior[action]?.({ ...transition, parent, child }) ?? child;
          if (
            next.id !== child.id ||
            next.type !== child.type ||
            next.children !== child.children
          ) {
            throw new Error(
              "Child transition behaviors cannot change identity, type or descendants",
            );
          }
          child = next;
        }
      }
    }
    validateBlockForest([{ ...child, children: undefined }]);
    return child;
  }

  /**
   * Checks whether a registered behavior transforms direct-child transitions.
   *
   * @returns True when placement and removal need transition preparation.
   */
  hasChildTransitionBehaviors(): boolean {
    return this.registry
      .getBehaviorRegistrations()
      .some(({ behavior }) => behavior.onChildEnter || behavior.onChildExit);
  }

  /**
   * Checks every moved root against its eventual parent before writing.
   *
   * A null target prepends within each current parent, so roots from different
   * parents are checked as separate groups. Sibling anchors are resolved in the
   * current document and retain their existing validation semantics.
   *
   * @param ids - Existing top-level roots in document order.
   * @param targetId - Receiving anchor, or null to retain each current parent.
   * @param position - Relationship to the receiving anchor.
   * @returns True only when every destination is permitted.
   */
  allowsGroupedMove(
    ids: readonly string[],
    targetId: string | null,
    position: "before" | "after" | "inside",
  ): boolean {
    if (!this.registry.getBehaviorRegistrations().some(({ behavior }) => behavior.canMove)) {
      return true;
    }
    const groups = new Map<string | null, EditorBlockNode[]>();
    for (const id of ids) {
      const block = this.blocks.getBlockNode(id)!;
      const parentId = targetId === null ? (this.blocks.getParentId(id) ?? null) : null;
      const group = groups.get(parentId) ?? [];
      group.push(block);
      groups.set(parentId, group);
    }
    if (targetId === null) {
      return [...groups].every(([parentId, sources]) =>
        this.canMove({ sources, destination: { parentId } }),
      );
    }
    let destination: BlockDestination;
    if (position === "inside") {
      destination = { parentId: targetId };
    } else if (position === "before") {
      destination = { parentId: this.blocks.getParentId(targetId) ?? null, beforeId: targetId };
    } else {
      destination = this.blocks.getInsertionDestinationAfter(targetId);
    }
    return this.canMove({ sources: groups.get(null) ?? [], destination });
  }
}
