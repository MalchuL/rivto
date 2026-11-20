import { BlockManager, type BlockManagerEditor } from "../managers/block-manager/block-manager";
import type { BlockDestination } from "@chulane/document-model";
import type {
  BlockImportOptions,
  BlockMoveRequest,
  DocumentEditorAPI,
  EditorBlock,
  EditorBlockInput,
  EditorBlockPatch,
  EditorBlockUpdate,
} from "..";

type PanelBlocksEditor = BlockManagerEditor & {
  readonly blocks: Pick<
    DocumentEditorAPI["blocks"],
    | "revision"
    | "hasBlock"
    | "getBlock"
    | "getBlockNode"
    | "getRootIds"
    | "getChildIds"
    | "getParentId"
    | "getOrderedIds"
    | "getInsertionDestinationAfter"
    | "insertBlock"
    | "importForest"
    | "updateBlock"
    | "updateBlocks"
    | "deleteListProps"
    | "deleteListPropsBatch"
    | "clearBlock"
    | "setBlockType"
    | "setBlockProp"
    | "setBlockPluginData"
    | "mergeBlocks"
    | "canMove"
    | "moveBlocks"
  >;
};

const EMPTY_IDS: readonly string[] = [];

/**
 * Block operations bound to one panel; actual writes retain the document's
 * validation and transactions.
 *
 * Membership is resolved from current ancestry on each call. A selected container
 * may expose only its children or include its protected root. The shared document
 * editor remains accessible separately and is not constrained by this facade.
 */
export class PanelBlocks extends BlockManager<PanelBlocksEditor> {
  /**
   * Binds block operations to a fixed subtree and visibility policy.
   *
   * A null boundary exposes all document roots. Including a boundary root makes
   * it readable but prevents its removal, movement, and outdent through this panel.
   *
   * @param panelEditor - Editor whose block manager and document are borrowed.
   * @param rootBlockId - Fixed boundary or null for document roots.
   * @param includeRoot - Whether the boundary block itself is displayed and protected; ignored for a null boundary.
   * @throws If the editor does not expose the standard block manager.
   */
  constructor(
    panelEditor: PanelBlocksEditor,
    readonly rootBlockId: string | null,
    readonly includeRoot: boolean,
  ) {
    // Panel commands borrow the document manager's processing pipeline.
    const manager = panelEditor.blocks;
    if (!(manager instanceof BlockManager)) {
      throw new Error("Panel requires the editor block manager");
    }
    super(panelEditor, manager);
  }

  /**
   * Reads the shared block revision, including changes outside this panel.
   *
   * @returns Document block revision, used to invalidate panel membership checks.
   */
  get revision() {
    return this.editor.blocks.revision;
  }
  /**
   * Evaluates movement only when local source records and the destination are within this panel.
   *
   * Detached records from another document remain eligible for the shared behavior checks.
   * Each source panel resolves its root so the policy sees the actual receiving parent.
   *
   * @param request - Source records and panel-relative destination.
   * @returns False for a protected or outside local source, invalid destination, or behavior veto.
   */
  canMove(request: BlockMoveRequest): boolean {
    if (
      request.sources.some(
        ({ id }) => this.editor.getDocument().blocks.hasBlock(id) && !this.canRemove(id),
      )
    ) {
      return false;
    }
    const destination = this.resolveDestination(request.destination);
    return (
      typeof destination !== "string" &&
      this.editor.blocks.canMove({ sources: request.sources, destination })
    );
  }
  /**
   * Checks current document ancestry against the fixed panel boundary.
   *
   * @param id - Candidate identity.
   * @returns Whether it is currently inside the panel.
   */
  hasBlock(id: string): boolean {
    const blocks = this.editor.blocks;
    if (!blocks.hasBlock(id)) {
      return false;
    }
    if (this.rootBlockId === null) {
      return true;
    }
    if (id === this.rootBlockId) {
      return this.includeRoot;
    }
    if (this.isSourceRoot()) {
      return true;
    }
    let parent = blocks.getParentId(id);
    while (parent) {
      if (parent === this.rootBlockId) {
        return true;
      }
      parent = blocks.getParentId(parent);
    }
    return false;
  }
  /**
   * Reads a flat block record without materializing its descendants.
   *
   * @param id - Identity to read.
   * @returns Own fields or undefined outside the panel.
   */
  getBlockNode(id: string) {
    return this.hasBlock(id) ? this.editor.blocks.getBlockNode(id) : undefined;
  }
  /**
   * Reads a block and its complete recursive subtree.
   *
   * @param id - Identity to read.
   * @returns Recursive snapshot or undefined outside the panel.
   */
  getBlock(id: string) {
    return this.hasBlock(id) ? this.editor.blocks.getBlock(id) : undefined;
  }
  private rootIds: readonly string[] = EMPTY_IDS;
  /**
   * Reads the ordered IDs displayed at the top level of this panel.
   *
   * The returned array retains its identity while its contents are unchanged.
   *
   * @returns Stable top-level IDs of this panel, empty while its selected root is absent.
   */
  getRootIds(): readonly string[] {
    let ids: readonly string[];
    if (this.rootBlockId === null) {
      ids = this.editor.blocks.getRootIds();
    } else if (
      this.isSourceRoot() &&
      !this.includeRoot &&
      !this.editor.blocks.hasBlock(this.rootBlockId)
    ) {
      ids = this.editor.blocks.getRootIds();
    } else if (!this.editor.blocks.hasBlock(this.rootBlockId)) {
      ids = EMPTY_IDS;
    } else if (this.includeRoot) {
      ids = [this.rootBlockId];
    } else {
      ids = this.editor.blocks.getChildIds(this.rootBlockId);
    }
    if (ids === this.rootIds) {
      return ids;
    }
    if (ids.length !== this.rootIds.length || ids.some((id, i) => id !== this.rootIds[i])) {
      this.rootIds = ids;
    }
    return this.rootIds;
  }
  /**
   * Reads the recursive snapshots of the displayed roots in sibling order.
   *
   * @returns Recursive snapshots of this panel's current roots.
   */
  getBlocks(): EditorBlock[] {
    return this.getRootIds().flatMap((id) => this.editor.blocks.getBlock(id) ?? []);
  }
  /**
   * Reads direct children of an included block without recursive snapshots.
   *
   * @param id - Local parent.
   * @returns Its direct children or empty outside the panel.
   */
  getChildIds(id: string): readonly string[] {
    return this.getBlockNode(id)?.childIds ?? EMPTY_IDS;
  }
  /**
   * Checks whether an included block has direct children.
   *
   * @param id - Local parent.
   * @returns Whether it has children.
   */
  hasChildren(id: string): boolean {
    return this.getChildIds(id).length > 0;
  }
  /**
   * Resolves parentage relative to the displayed panel tree.
   *
   * @param id - Candidate block.
   * @returns Local parent, null at the panel's top level, or undefined outside.
   */
  getParentId(id: string): string | null | undefined {
    if (!this.hasBlock(id)) {
      return undefined;
    }
    if (this.includeRoot && id === this.rootBlockId) {
      return null;
    }
    const parent = this.editor.blocks.getParentId(id);
    return !this.includeRoot && parent === this.rootBlockId ? null : parent;
  }
  /**
   * Checks whether a block is displayed at the top level of this panel.
   *
   * @param id - Candidate block.
   * @returns Whether it is a displayed root.
   */
  isRootBlock(id: string): boolean {
    return this.getParentId(id) === null;
  }
  /**
   * Filters candidates to this panel and orders them using document traversal.
   *
   * @param ids - Candidate IDs.
   * @returns Local IDs in document order.
   */
  getOrderedIds(ids: Iterable<string>): string[] {
    return this.editor.blocks.getOrderedIds([...ids].filter((id) => this.hasBlock(id)));
  }
  /**
   * Observes changes to the displayed root ID list.
   *
   * Registration does not invoke the listener. The listener runs only when the
   * ordered IDs change, rather than for payload edits to unchanged roots.
   *
   * @param listener - Root-list observer.
   * @returns Cleanup; payload edits do not notify unchanged roots.
   */
  subscribeRootIds(listener: () => void): () => void {
    let previous = this.getRootIds();
    const notify = () => {
      const next = this.getRootIds();
      if (next !== previous) {
        previous = next;
        listener();
      }
    };
    if (this.rootBlockId === null) {
      return super.subscribeRootIds(notify);
    }
    return super.subscribeBlockNode(this.rootBlockId, notify);
  }
  /**
   * Observes shared document structure changes.
   *
   * Notifications are not filtered to this panel; consumers must reread membership.
   *
   * @param listener - Structural observer.
   * @returns Cleanup for document placement changes affecting membership.
   */
  subscribeStructure(listener: () => void): () => void {
    return super.subscribeStructure(listener);
  }
  /**
   * Observes a recursive subtree while tracking its panel membership.
   *
   * An absent or outside ID can be observed. Entry into or exit from the panel
   * notifies the listener, as do subtree changes while the ID is included.
   *
   * @param id - Candidate subtree.
   * @param listener - Observer.
   * @returns Cleanup, including entry/exit notifications.
   */
  subscribeBlock(id: string, listener: () => void): () => void {
    return this.observe(id, listener, false);
  }
  /**
   * Observes one flat record while tracking its panel membership.
   *
   * Entry into or exit from the panel notifies the listener; descendant payload
   * changes alone do not notify this node subscription.
   *
   * @param id - Candidate node.
   * @param listener - Observer.
   * @returns Cleanup; descendant payload changes do not notify.
   */
  subscribeBlockNode(id: string, listener: () => void): () => void {
    return this.observe(id, listener, true);
  }
  /**
   * Checks whether an included block may be structurally removed or moved.
   *
   * @param id - Candidate identity.
   * @returns Whether deletion/movement is allowed by the panel boundary.
   */
  canRemove(id: string): boolean {
    return this.hasBlock(id) && !(this.includeRoot && id === this.rootBlockId);
  }
  /**
   * Checks whether a block can move up one level without leaving the panel.
   *
   * @param id - Candidate identity.
   * @returns Whether outdent stays within the panel.
   */
  canOutdent(id: string): boolean {
    return (
      this.canRemove(id) &&
      this.editor.blocks.getParentId(id) !== this.rootBlockId &&
      this.getParentId(id) !== null
    );
  }
  /**
   * Resolves a sibling anchor into an explicit destination within the panel.
   *
   * @param afterId - Local sibling, null to prepend, or omitted to append.
   * @returns Explicit panel destination.
   * @throws If insertion would escape the panel.
   */
  getInsertionDestinationAfter(afterId?: string | null): BlockDestination {
    if (afterId === undefined) {
      return { parentId: null };
    }
    if (afterId === null) {
      return {
        parentId: null,
        beforeId:
          this.rootBlockId === null ||
          (this.isSourceRoot() && !this.editor.blocks.hasBlock(this.rootBlockId))
            ? this.getRootIds()[0]
            : this.editor.blocks.getChildIds(this.rootBlockId)[0],
      };
    }
    if (this.includeRoot && afterId === this.rootBlockId && this.hasBlock(afterId)) {
      return { parentId: afterId, beforeId: this.getChildIds(afterId)[0] };
    }
    this.require(afterId, true);
    const result = this.editor.blocks.getInsertionDestinationAfter(afterId);
    if (result.parentId === this.rootBlockId) {
      return { parentId: null, beforeId: result.beforeId };
    }
    return result;
  }
  /**
   * Inserts a prepared subtree at a panel-relative destination.
   *
   * The default destination appends to the selected container or document roots.
   * Document commands retain responsibility for processing, validation, and transactions.
   *
   * @param input - Validated creation input.
   * @param destination - Panel root or local parent.
   * @returns Inserted subtree.
   * @throws Before writes for an invalid destination or input.
   */
  insertBlock(
    input: EditorBlockInput,
    destination: BlockDestination = { parentId: null },
  ): EditorBlock {
    return this.editor.blocks.insertBlock(input, this.destination(destination));
  }
  /**
   * Imports copied subtrees at a panel-relative destination.
   *
   * The default destination appends to panel roots. Preparation and identity
   * remapping are delegated to the shared document commands.
   *
   * @param input - Copied forest.
   * @param destination - Local parent or panel root.
   * @param options - Optional recovery, preallocated identities, and identity requirements.
   * @param options.onError - Optional preparation recovery.
   * @param options.ids - Preallocated import identities.
   * @param options.preserveIds - Whether every source identity must be preserved.
   * @returns Imported subtrees and their ID map.
   * @throws Before writes for an invalid panel destination.
   */
  importForest(
    input: readonly (EditorBlock | EditorBlockInput)[],
    destination: BlockDestination = { parentId: null },
    options?: BlockImportOptions,
  ) {
    return this.editor.blocks.importForest(input, this.destination(destination), options);
  }
  /**
   * Patches one included block through the document commands.
   *
   * @param id - Local block.
   * @param patch - Mutable fields.
   * @returns Updated node.
   * @throws Before writing outside the panel.
   */
  updateBlock(id: string, patch: EditorBlockPatch) {
    this.require(id);
    return this.editor.blocks.updateBlock(id, patch);
  }
  /**
   * Checks every target before delegating the ordered patch batch.
   *
   * @param updates - Ordered local patches.
   * @returns Updated nodes.
   * @throws Before writes if any target is outside.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]) {
    updates.forEach(({ id }) => this.require(id));
    return this.editor.blocks.updateBlocks(updates);
  }
  /**
   * Removes selected list-property keys from an included block.
   *
   * @param id - Local block.
   * @param keys - List keys to remove.
   * @returns Whether anything changed.
   * @throws If a required block is outside the panel or document validation fails.
   */
  deleteListProps(id: string, keys: readonly string[]) {
    this.require(id);
    return this.editor.blocks.deleteListProps(id, keys);
  }
  /**
   * Checks every target before removing list-property keys in a batch.
   *
   * @param updates - Local list-property removals.
   * @throws Before writing for any outside target, or if document validation fails.
   */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]) {
    updates.forEach(({ id }) => this.require(id));
    this.editor.blocks.deleteListPropsBatch(updates);
  }
  /**
   * Clears an included block through the document commands, preserving its ID.
   *
   * @param id - Local block whose content is cleared while preserving identity.
   * @throws If a required block is outside the panel or document validation fails.
   */
  clearBlock(id: string) {
    this.require(id);
    this.editor.blocks.clearBlock(id);
  }
  /**
   * Changes the type of an included block through the document commands.
   *
   * @param id - Local block.
   * @param type - Registered destination type.
   * @throws If a required block is outside the panel or document validation fails.
   */
  setBlockType(id: string, type: string) {
    this.require(id);
    this.editor.blocks.setBlockType(id, type);
  }
  /**
   * Sets or removes one property on an included block.
   *
   * @param id - Local block.
   * @param key - Property key.
   * @param value - Validated value or undefined to remove.
   * @throws If a required block is outside the panel or document validation fails.
   */
  setBlockProp(id: string, key: string, value: unknown) {
    this.require(id);
    this.editor.blocks.setBlockProp(id, key, value);
  }
  /**
   * Writes plugin data in one namespace on an included block.
   *
   * @param id - Local block.
   * @param pluginId - Namespace.
   * @param value - Portable plugin data.
   * @throws If a required block is outside the panel or document validation fails.
   */
  setBlockPluginData(id: string, pluginId: string, value: unknown) {
    this.require(id);
    this.editor.blocks.setBlockPluginData(id, pluginId, value);
  }
  /**
   * Validates all selected subtree roots before deleting them together.
   *
   * @param ids - Local subtrees.
   * @throws Before any write if a target is outside or protected.
   */
  removeBlocks(ids: readonly string[]): boolean {
    ids.forEach((id) => this.require(id, true));
    return super.removeBlocks(ids);
  }
  /**
   * Replaces text and removes trailing blocks within this panel's boundary.
   *
   * @param firstId - Local block receiving the replacement content.
   * @param trailingIds - Local removable blocks covered by the selection.
   * @param content - Replacement content for the surviving block.
   * @returns The replacement and permitted removals have been applied.
   * @throws If a block is outside the panel, a removed root is protected, or a mutation fails.
   */
  replaceTextSelection(firstId: string, trailingIds: readonly string[], content: string): void {
    this.require(firstId);
    trailingIds.forEach((id) => this.require(id, true));
    super.replaceTextSelection(firstId, trailingIds, content);
  }
  /**
   * Merges a removable source block into an included surviving block.
   *
   * @param targetId - Surviving local block.
   * @param sourceId - Removed local block.
   * @returns Caret offset after merging.
   * @throws If a required block is outside the panel, a structural target is protected, or document validation fails.
   */
  mergeBlocks(targetId: string, sourceId: string) {
    this.require(targetId);
    this.require(sourceId, true);
    return this.editor.blocks.mergeBlocks(targetId, sourceId);
  }
  /**
   * Moves one subtree relative to an included target.
   *
   * The default placement is after the target; null selects the current sibling-list start.
   *
   * @param id - Local subtree.
   * @param targetId - Local destination or current sibling-list start.
   * @param position - Placement relative to target.
   * @throws If a required block is outside the panel, a structural target is protected, or document validation fails.
   */
  moveBlock(
    id: string,
    targetId: string | null,
    position: "before" | "after" | "inside" = "after",
  ) {
    this.moveBlocks([id], targetId, position);
  }
  /**
   * Checks source and target boundaries before moving selected subtrees.
   *
   * The default placement is after the target. A protected root may receive children
   * but cannot be moved or used as a before/after target. The hidden boundary of a
   * children-only panel also accepts inside moves through the same insertion validation.
   *
   * @param ids - Local subtrees.
   * @param targetId - Local destination or current sibling-list start.
   * @param position - Placement.
   * @throws Before writes for an outside or protected target.
   */
  moveBlocks(
    ids: readonly string[],
    targetId: string | null,
    position: "before" | "after" | "inside" = "after",
  ) {
    ids.forEach((id) => this.require(id, true));
    if (targetId !== null) {
      if (position === "inside") {
        this.destination({ parentId: targetId });
      } else {
        this.require(targetId, true);
      }
    }
    this.editor.blocks.moveBlocks([...ids], targetId, position);
  }
  /**
   * Indents selected sibling roots without adopting an outside sibling.
   *
   * @param ids - Local sibling roots.
   * @throws If indent could adopt an outside sibling.
   */
  indentBlocks(ids: readonly string[]): boolean {
    ids.forEach((id) => this.require(id, true));
    return super.indentBlocks([...ids]);
  }

  /**
   * Checks all selected roots before delegating an outdent to document commands.
   *
   * @param ids - Local sibling roots.
   * @throws Before mutation if any outdent crosses the boundary.
   */
  outdentBlocks(ids: readonly string[]): boolean {
    ids.forEach((id) => {
      this.require(id, true);
      if (!this.canOutdent(id)) {
        throw new Error("Cannot outdent outside panel");
      }
    });
    return super.outdentBlocks([...ids]);
  }

  /**
   * Observes a block and its membership in the panel, notifying when the block changes or enters or leaves scope.
   *
   * @param id - Stable block ID to observe within this panel.
   * @param listener - Callback invoked for record changes while present or when panel membership changes.
   * @param node - Whether to observe a shallow block node instead of its recursive subtree.
   * @returns Cleanup that removes both record and hierarchy subscriptions.
   */
  private observe(id: string, listener: () => void, node: boolean): () => void {
    let present = this.hasBlock(id);
    const notify = () => {
      const next = this.hasBlock(id);
      const changed = present || next;
      present = next;
      if (changed) {
        listener();
      }
    };
    const dispose = node ? super.subscribeBlockNode(id, notify) : super.subscribeBlock(id, notify);
    const structure = super.subscribeStructure(() => {
      const next = this.hasBlock(id);
      if (next !== present) {
        present = next;
        listener();
      }
    });
    return () => {
      dispose();
      structure();
    };
  }
  /**
   * Guards block access and optionally disallows structural changes to a protected panel root.
   *
   * @param id - Stable block ID that must belong to this panel.
   * @param structural - Whether to reject structural changes to a protected panel root; defaults to false.
   * @throws If the block is outside the panel or a structural operation targets the panel root.
   */
  private require(id: string, structural = false): void {
    if (!this.hasBlock(id)) {
      throw new Error(`Block ${id} not found in panel`);
    }
    if (structural && !this.canRemove(id)) {
      throw new Error(`Panel root ${id} is protected`);
    }
  }
  /**
   * Converts a panel-local insertion destination to document coordinates after checking parent and anchor membership.
   *
   * @param destination - Panel-local parent or root and optional insertion anchor.
   * @returns Validated document insertion destination.
   * @throws If the destination is malformed, its parent is missing or outside the panel, or its anchor belongs to another parent.
   */
  private destination(destination: BlockDestination): BlockDestination {
    const resolved = this.resolveDestination(destination);
    if (typeof resolved === "string") {
      throw new Error(resolved);
    }
    return resolved;
  }

  /**
   * Resolves one level of panel-relative placement for both move checks and writes.
   *
   * A nested panel passes its result to its source panel for the next boundary check.
   *
   * @param destination - The local parent and optional sibling insertion anchor.
   * @returns The source editor's placement, or the reason the placement is inaccessible.
   */
  private resolveDestination(destination: BlockDestination): BlockDestination | string {
    if (destination.parentId !== null && typeof destination.parentId !== "string") {
      return "Panel destination requires parentId: null or a parent ID";
    }
    const parentId = destination.parentId === null ? this.rootBlockId : destination.parentId;
    const sourceRoot = this.isSourceRoot() && parentId === this.rootBlockId;
    if (parentId !== null) {
      if (parentId === this.rootBlockId) {
        if (
          !(sourceRoot
            ? this.editor.getDocument().blocks.hasBlock(parentId)
            : this.editor.blocks.hasBlock(parentId))
        ) {
          return `Panel root ${parentId} not found`;
        }
      } else if (!this.hasBlock(parentId)) {
        return `Block ${parentId} not found in panel`;
      }
    }
    if (destination.beforeId !== undefined) {
      if (!this.hasBlock(destination.beforeId)) {
        return `Block ${destination.beforeId} not found in panel`;
      }
      const sourceParent = this.editor.blocks.getParentId(destination.beforeId);
      if (sourceParent !== parentId && !(sourceRoot && sourceParent === null)) {
        return "Insertion anchor belongs to another parent";
      }
    }
    return { parentId: sourceRoot ? null : parentId, beforeId: destination.beforeId };
  }

  /**
   * Checks whether this panel uses its source panel's block root.
   *
   * @returns True when that root is already represented by the source panel.
   */
  private isSourceRoot(): boolean {
    return (
      this.rootBlockId !== null &&
      this.editor.blocks instanceof PanelBlocks &&
      this.rootBlockId === this.editor.blocks.rootBlockId
    );
  }
}
