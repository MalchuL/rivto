import type { BlockDestination } from "@chulane/document-model";
import type {
  BlockPrepareErrorHandler,
  DocumentEditorAPI,
  EditorBlock,
  EditorBlockInput,
  EditorBlockPatch,
  EditorBlockUpdate,
} from "..";
import type { PanelBlocksAPI, PanelDestination } from "./types";

const EMPTY_IDS: readonly string[] = [];

/**
 * Block operations bound to one panel; actual writes retain the document's
 * validation and transactions.
 *
 * Membership is resolved from current ancestry on each call. A selected container
 * may expose only its children or include its protected root. The shared document
 * editor remains accessible separately and is not constrained by this facade.
 */
export class PanelBlocks implements PanelBlocksAPI {
  /**
   * Binds block operations to a fixed subtree and visibility policy.
   *
   * A null boundary exposes all document roots. Including a boundary root makes
   * it readable but prevents its removal, movement, and outdent through this panel.
   *
   * @param document - Shared document commands.
   * @param rootBlockId - Fixed boundary or null for document roots.
   * @param includeRoot - Whether the boundary block itself is displayed and protected; ignored for a null boundary.
   */
  constructor(
    private readonly document: DocumentEditorAPI,
    readonly rootBlockId: string | null,
    readonly includeRoot: boolean,
  ) {}

  /**
   * Reads the shared block revision, including changes outside this panel.
   *
   * @returns Document block revision, used to invalidate panel membership checks.
   */
  get revision() {
    return this.document.blocks.revision;
  }
  /**
   * Checks current document ancestry against the fixed panel boundary.
   *
   * @param id - Candidate identity.
   * @returns Whether it is currently inside the panel.
   */
  hasBlock(id: string): boolean {
    const blocks = this.document.blocks;
    if (!blocks.hasBlock(id)) {
      return false;
    }
    if (this.rootBlockId === null) {
      return true;
    }
    if (id === this.rootBlockId) {
      return this.includeRoot;
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
    return this.hasBlock(id) ? this.document.blocks.getBlockNode(id) : undefined;
  }
  /**
   * Reads a block and its complete recursive subtree.
   *
   * @param id - Identity to read.
   * @returns Recursive snapshot or undefined outside the panel.
   */
  getBlock(id: string) {
    return this.hasBlock(id) ? this.document.blocks.getBlock(id) : undefined;
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
      ids = this.document.blocks.getRootIds();
    } else if (!this.document.blocks.hasBlock(this.rootBlockId)) {
      ids = EMPTY_IDS;
    } else if (this.includeRoot) {
      ids = [this.rootBlockId];
    } else {
      ids = this.document.blocks.getChildIds(this.rootBlockId);
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
    return this.getRootIds().flatMap((id) => this.document.blocks.getBlock(id) ?? []);
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
    const parent = this.document.blocks.getParentId(id);
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
    return this.document.blocks.getOrderedIds([...ids].filter((id) => this.hasBlock(id)));
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
      return this.document.blocks.subscribeRootIds(notify);
    }
    return this.document.blocks.subscribeBlockNode(this.rootBlockId, notify);
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
    return this.document.blocks.subscribeStructure(listener);
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
      this.document.blocks.getParentId(id) !== this.rootBlockId &&
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
  getInsertionDestinationAfter(afterId?: string | null): PanelDestination {
    if (afterId === undefined) {
      return { root: true };
    }
    if (afterId === null) {
      return {
        root: true,
        beforeId:
          this.rootBlockId === null
            ? this.getRootIds()[0]
            : this.document.blocks.getChildIds(this.rootBlockId)[0],
      };
    }
    this.require(afterId, true);
    const result = this.document.blocks.getInsertionDestinationAfter(afterId);
    if (result.parentId === this.rootBlockId) {
      return { root: true, beforeId: result.beforeId };
    }
    return { parentId: result.parentId!, beforeId: result.beforeId };
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
    destination: PanelDestination = { root: true },
  ): EditorBlock {
    return this.document.blocks.insertBlock(input, this.destination(destination));
  }
  /**
   * Imports copied subtrees at a panel-relative destination.
   *
   * The default destination appends to panel roots. Preparation and identity
   * remapping are delegated to the shared document commands.
   *
   * @param input - Copied forest.
   * @param destination - Local parent or panel root.
   * @param onError - Optional preparation recovery.
   * @param ids - Preallocated import identities.
   * @returns Imported subtrees and their ID map.
   * @throws Before writes for an invalid panel destination.
   */
  importForest(
    input: readonly (EditorBlock | EditorBlockInput)[],
    destination: PanelDestination = { root: true },
    onError?: BlockPrepareErrorHandler,
    ids?: ReadonlyMap<string, string>,
  ) {
    return this.document.blocks.importForest(input, this.destination(destination), onError, ids);
  }
  /**
   * Prepares detached block inputs through the document processing pipeline.
   *
   * @param input - Detached forest.
   * @param onError - Optional preparation recovery.
   * @returns Prepared inputs without changing the document.
   */
  prepareInput(
    input: readonly (EditorBlock | EditorBlockInput)[],
    onError?: BlockPrepareErrorHandler,
  ) {
    return this.document.blocks.prepareInput(input, onError);
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
    return this.document.blocks.updateBlock(id, patch);
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
    return this.document.blocks.updateBlocks(updates);
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
    return this.document.blocks.deleteListProps(id, keys);
  }
  /**
   * Checks every target before removing list-property keys in a batch.
   *
   * @param updates - Local list-property removals.
   * @throws Before writing for any outside target, or if document validation fails.
   */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]) {
    updates.forEach(({ id }) => this.require(id));
    this.document.blocks.deleteListPropsBatch(updates);
  }
  /**
   * Clears an included block through the document commands, preserving its ID.
   *
   * @param id - Local block whose content is cleared while preserving identity.
   * @throws If a required block is outside the panel or document validation fails.
   */
  clearBlock(id: string) {
    this.require(id);
    this.document.blocks.clearBlock(id);
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
    this.document.blocks.setBlockType(id, type);
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
    this.document.blocks.setBlockProp(id, key, value);
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
    this.document.blocks.setBlockPluginData(id, pluginId, value);
  }
  /**
   * Deletes an included subtree while protecting the displayed embedding root.
   *
   * @param id - Local subtree to remove.
   * @throws If outside or the protected embedding root.
   */
  removeBlock(id: string) {
    this.removeBlocks([id]);
  }
  /**
   * Validates all selected subtree roots before deleting them together.
   *
   * @param ids - Local subtrees.
   * @throws Before any write if a target is outside or protected.
   */
  removeBlocks(ids: readonly string[]) {
    ids.forEach((id) => this.require(id, true));
    this.document.blocks.removeBlocks([...ids]);
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
    return this.document.blocks.mergeBlocks(targetId, sourceId);
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
    this.document.blocks.moveBlocks([...ids], targetId, position);
  }
  /**
   * Indents one removable subtree under its preceding sibling.
   *
   * @param id - Local subtree to indent.
   * @throws If a required block is outside the panel, a structural target is protected, or document validation fails.
   */
  indentBlock(id: string) {
    this.indentBlocks([id]);
  }
  /**
   * Indents selected sibling roots without adopting an outside sibling.
   *
   * @param ids - Local sibling roots.
   * @throws If indent could adopt an outside sibling.
   */
  indentBlocks(ids: readonly string[]) {
    ids.forEach((id) => this.require(id, true));
    if (!ids.length) {
      return;
    }
    const ordered = this.document.blocks.getOrderedIds(ids);
    const parent = this.document.blocks.getParentId(ordered[0]!);
    const siblings =
      parent == null ? this.document.blocks.getRootIds() : this.document.blocks.getChildIds(parent);
    const previous = siblings[siblings.indexOf(ordered[0]!) - 1];
    if (previous) {
      this.require(previous);
    }
    this.document.blocks.indentBlocks([...ids]);
  }
  /**
   * Moves one subtree up a level while enforcing the panel boundary.
   *
   * @param id - Local subtree to outdent.
   * @throws At the panel boundary.
   */
  outdentBlock(id: string) {
    this.outdentBlocks([id]);
  }
  /**
   * Checks all selected roots before delegating an outdent to document commands.
   *
   * @param ids - Local sibling roots.
   * @throws Before mutation if any outdent crosses the boundary.
   */
  outdentBlocks(ids: readonly string[]) {
    ids.forEach((id) => {
      this.require(id, true);
      if (!this.canOutdent(id)) {
        throw new Error("Cannot outdent outside panel");
      }
    });
    this.document.blocks.outdentBlocks([...ids]);
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
    const dispose = node
      ? this.document.blocks.subscribeBlockNode(id, notify)
      : this.document.blocks.subscribeBlock(id, notify);
    const structure = this.document.blocks.subscribeStructure(() => {
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
  private destination(destination: PanelDestination): BlockDestination {
    if (
      "root" in destination ? destination.root !== true : typeof destination.parentId !== "string"
    ) {
      throw new Error("Panel destination requires root: true or a parent ID");
    }
    const parentId = "root" in destination ? this.rootBlockId : destination.parentId;
    if (parentId !== null) {
      if (parentId === this.rootBlockId) {
        if (!this.document.blocks.hasBlock(parentId)) {
          throw new Error(`Panel root ${parentId} not found`);
        }
      } else {
        this.require(parentId);
      }
    }
    if (destination.beforeId !== undefined) {
      this.require(destination.beforeId);
      if (this.document.blocks.getParentId(destination.beforeId) !== parentId) {
        throw new Error("Insertion anchor belongs to another parent");
      }
    }
    return { parentId, beforeId: destination.beforeId };
  }
}
