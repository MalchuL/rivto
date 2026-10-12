import type { BlockDestination } from "@chulane/document-model";
import type { BlockPrepareErrorHandler, DocumentEditorAPI, EditorBlock, EditorBlockInput, EditorBlockPatch, EditorBlockUpdate } from "@chulane/rivto";
import type { PanelDestination } from "./panel-destination";

const EMPTY_IDS: readonly string[] = [];

/** Block operations bound to one panel; actual writes retain the document's validation and transactions. */
export class PanelBlocks {
  /** @param document - Shared document commands. @param rootBlockId - Fixed boundary or null for document roots. @param includeRoot - Whether the boundary block itself is displayed and protected. */
  constructor(private readonly document: DocumentEditorAPI, readonly rootBlockId: string | null, readonly includeRoot: boolean) {}

  /** @returns Document block revision, used to invalidate panel membership checks. */
  get revision() { return this.document.blocks.revision; }
  /** @param id - Candidate identity. @returns Whether it is currently inside the panel. */
  hasBlock(id: string): boolean {
    const blocks = this.document.blocks;
    if (!blocks.hasBlock(id)) return false;
    if (this.rootBlockId === null) return true;
    if (id === this.rootBlockId) return this.includeRoot;
    let parent = blocks.getParentId(id);
    while (parent) {
      if (parent === this.rootBlockId) return true;
      parent = blocks.getParentId(parent);
    }
    return false;
  }
  /** @param id - Identity to read. @returns Own fields or undefined outside the panel. */
  getBlockNode(id: string) { return this.hasBlock(id) ? this.document.blocks.getBlockNode(id) : undefined; }
  /** @param id - Identity to read. @returns Recursive snapshot or undefined outside the panel. */
  getBlock(id: string) { return this.hasBlock(id) ? this.document.blocks.getBlock(id) : undefined; }
  private rootIds: readonly string[] = EMPTY_IDS;
  /** @returns Stable top-level IDs of this panel, empty while its selected root is absent. */
  getRootIds(): readonly string[] {
    let ids: readonly string[];
    if (this.rootBlockId === null) ids = this.document.blocks.getRootIds();
    else if (!this.document.blocks.hasBlock(this.rootBlockId)) ids = EMPTY_IDS;
    else if (this.includeRoot) ids = [this.rootBlockId];
    else ids = this.document.blocks.getChildIds(this.rootBlockId);
    if (ids === this.rootIds) return ids;
    if (ids.length !== this.rootIds.length || ids.some((id, i) => id !== this.rootIds[i])) this.rootIds = ids;
    return this.rootIds;
  }
  /** @returns Recursive snapshots of this panel's current roots. */
  getBlocks(): EditorBlock[] { return this.getRootIds().flatMap(id => this.document.blocks.getBlock(id) ?? []); }
  /** @param id - Local parent. @returns Its direct children or empty outside the panel. */
  getChildIds(id: string): readonly string[] { return this.getBlockNode(id)?.childIds ?? EMPTY_IDS; }
  /** @param id - Local parent. @returns Whether it has children. */
  hasChildren(id: string): boolean { return this.getChildIds(id).length > 0; }
  /** @param id - Candidate block. @returns Local parent, null at the panel's top level, or undefined outside. */
  getParentId(id: string): string | null | undefined {
    if (!this.hasBlock(id)) return undefined;
    if (this.includeRoot && id === this.rootBlockId) return null;
    const parent = this.document.blocks.getParentId(id);
    return !this.includeRoot && parent === this.rootBlockId ? null : parent;
  }
  /** @param id - Candidate block. @returns Whether it is a displayed root. */
  isRootBlock(id: string): boolean { return this.getParentId(id) === null; }
  /** @param ids - Candidate IDs. @returns Local IDs in document order. */
  getOrderedIds(ids: Iterable<string>): string[] { return this.document.blocks.getOrderedIds([...ids].filter(id => this.hasBlock(id))); }
  /** @param listener - Root-list observer. @returns Cleanup; payload edits do not notify unchanged roots. */
  subscribeRootIds(listener: () => void): () => void {
    let previous = this.getRootIds();
    const notify = () => { const next = this.getRootIds(); if (next !== previous) { previous = next; listener(); } };
    if (this.rootBlockId === null) return this.document.blocks.subscribeRootIds(notify);
    return this.document.blocks.subscribeBlockNode(this.rootBlockId, notify);
  }
  /** @param listener - Structural observer. @returns Cleanup for document placement changes affecting membership. */
  subscribeStructure(listener: () => void): () => void { return this.document.blocks.subscribeStructure(listener); }
  /** @param id - Candidate subtree. @param listener - Observer. @returns Cleanup, including entry/exit notifications. */
  subscribeBlock(id: string, listener: () => void): () => void { return this.observe(id, listener, false); }
  /** @param id - Candidate node. @param listener - Observer. @returns Cleanup; descendant payload changes do not notify. */
  subscribeBlockNode(id: string, listener: () => void): () => void { return this.observe(id, listener, true); }
  private observe(id: string, listener: () => void, node: boolean): () => void {
    let present = this.hasBlock(id);
    const notify = () => { const next = this.hasBlock(id); const changed = present || next; present = next; if (changed) listener(); };
    const dispose = node ? this.document.blocks.subscribeBlockNode(id, notify) : this.document.blocks.subscribeBlock(id, notify);
    const structure = this.document.blocks.subscribeStructure(() => { const next = this.hasBlock(id); if (next !== present) { present = next; listener(); } });
    return () => { dispose(); structure(); };
  }
  /** @param id - Candidate identity. @returns Whether deletion/movement is allowed by the panel boundary. */
  canRemove(id: string): boolean { return this.hasBlock(id) && !(this.includeRoot && id === this.rootBlockId); }
  /** @param id - Candidate identity. @returns Whether outdent stays within the panel. */
  canOutdent(id: string): boolean {
    return this.canRemove(id) && this.document.blocks.getParentId(id) !== this.rootBlockId && this.getParentId(id) !== null;
  }
  private require(id: string, structural = false): void {
    if (!this.hasBlock(id)) throw new Error(`Block ${id} not found in panel`);
    if (structural && !this.canRemove(id)) throw new Error(`Panel root ${id} is protected`);
  }
  private destination(destination: PanelDestination): BlockDestination {
    if ('root' in destination ? destination.root !== true : typeof destination.parentId !== 'string') throw new Error('Panel destination requires root: true or a parent ID');
    const parentId = 'root' in destination ? this.rootBlockId : destination.parentId;
    if (parentId !== null) {
      if (parentId === this.rootBlockId) {
        if (!this.document.blocks.hasBlock(parentId)) throw new Error(`Panel root ${parentId} not found`);
      } else this.require(parentId);
    }
    if (destination.beforeId !== undefined) {
      this.require(destination.beforeId);
      if (this.document.blocks.getParentId(destination.beforeId) !== parentId) throw new Error('Insertion anchor belongs to another parent');
    }
    return { parentId, beforeId: destination.beforeId };
  }
  /** @param afterId - Local sibling, null to prepend, or omitted to append. @returns Explicit panel destination. @throws If insertion would escape the panel. */
  getInsertionDestinationAfter(afterId?: string | null): PanelDestination {
    if (afterId === undefined) return { root: true };
    if (afterId === null) return { root: true, beforeId: this.rootBlockId === null ? this.getRootIds()[0] : this.document.blocks.getChildIds(this.rootBlockId)[0] };
    this.require(afterId, true);
    const result = this.document.blocks.getInsertionDestinationAfter(afterId);
    if (result.parentId === this.rootBlockId) return { root: true, beforeId: result.beforeId };
    return { parentId: result.parentId!, beforeId: result.beforeId };
  }
  /** @param input - Validated creation input. @param destination - Panel root or local parent. @returns Inserted subtree. @throws Before writes for an invalid destination or input. */
  insertBlock(input: EditorBlockInput, destination: PanelDestination = { root: true }): EditorBlock { return this.document.blocks.insertBlock(input, this.destination(destination)); }
  /** @param input - Copied forest. @param destination - Local parent or panel root. @param onError - Optional preparation recovery. @param ids - Preallocated import identities. @returns Imported subtrees and their ID map. @throws Before writes for an invalid panel destination. */
  importForest(input: readonly (EditorBlock | EditorBlockInput)[], destination: PanelDestination = { root: true }, onError?: BlockPrepareErrorHandler, ids?: ReadonlyMap<string, string>) {
    return this.document.blocks.importForest(input, this.destination(destination), onError, ids);
  }
  /** @param input - Detached forest. @param onError - Optional preparation recovery. @returns Prepared inputs without changing the document. */
  prepareInput(input: readonly (EditorBlock | EditorBlockInput)[], onError?: BlockPrepareErrorHandler) { return this.document.blocks.prepareInput(input, onError); }
  /** @param id - Local block. @param patch - Mutable fields. @returns Updated node. @throws Before writing outside the panel. */
  updateBlock(id: string, patch: EditorBlockPatch) { this.require(id); return this.document.blocks.updateBlock(id, patch); }
  /** @param updates - Ordered local patches. @returns Updated nodes. @throws Before writes if any target is outside. */
  updateBlocks(updates: readonly EditorBlockUpdate[]) { updates.forEach(({id}) => this.require(id)); return this.document.blocks.updateBlocks(updates); }
  /** @param id - Local block. @param keys - List keys to remove. @returns Whether anything changed. */
  deleteListProps(id: string, keys: readonly string[]) { this.require(id); return this.document.blocks.deleteListProps(id, keys); }
  /** @param updates - Local list-property removals. @throws Before writing for any outside target. */
  deleteListPropsBatch(updates: readonly {id: string; keys: readonly string[]}[]) { updates.forEach(({id}) => this.require(id)); this.document.blocks.deleteListPropsBatch(updates); }
  /** @param id - Local block whose content is cleared while preserving identity. */
  clearBlock(id: string) { this.require(id); this.document.blocks.clearBlock(id); }
  /** @param id - Local block. @param type - Registered destination type. */
  setBlockType(id: string, type: string) { this.require(id); this.document.blocks.setBlockType(id, type); }
  /** @param id - Local block. @param key - Property key. @param value - Validated value or undefined to remove. */
  setBlockProp(id: string, key: string, value: unknown) { this.require(id); this.document.blocks.setBlockProp(id, key, value); }
  /** @param id - Local block. @param pluginId - Namespace. @param value - Portable plugin data. */
  setBlockPluginData(id: string, pluginId: string, value: unknown) { this.require(id); this.document.blocks.setBlockPluginData(id, pluginId, value); }
  /** @param id - Local subtree to remove. @throws If outside or the protected embedding root. */
  removeBlock(id: string) { this.removeBlocks([id]); }
  /** @param ids - Local subtrees. @throws Before any write if a target is outside or protected. */
  removeBlocks(ids: readonly string[]) { ids.forEach(id => this.require(id, true)); this.document.blocks.removeBlocks([...ids]); }
  /** @param targetId - Surviving local block. @param sourceId - Removed local block. @returns Caret offset after merging. */
  mergeBlocks(targetId: string, sourceId: string) { this.require(targetId); this.require(sourceId, true); return this.document.blocks.mergeBlocks(targetId, sourceId); }
  /** @param id - Local subtree. @param targetId - Local destination or current sibling-list start. @param position - Placement relative to target. */
  moveBlock(id: string, targetId: string | null, position: 'before' | 'after' | 'inside' = 'after') { this.moveBlocks([id], targetId, position); }
  /** @param ids - Local subtrees. @param targetId - Local destination or current sibling-list start. @param position - Placement. @throws Before writes for an outside or protected target. */
  moveBlocks(ids: readonly string[], targetId: string | null, position: 'before' | 'after' | 'inside' = 'after') {
    ids.forEach(id => this.require(id, true));
    if (targetId !== null) this.require(targetId, position !== 'inside');
    this.document.blocks.moveBlocks([...ids], targetId, position);
  }
  /** @param id - Local subtree to indent. */
  indentBlock(id: string) { this.indentBlocks([id]); }
  /** @param ids - Local sibling roots. @throws If indent could adopt an outside sibling. */
  indentBlocks(ids: readonly string[]) {
    ids.forEach(id => this.require(id, true));
    if (!ids.length) return;
    const ordered = this.document.blocks.getOrderedIds(ids);
    const parent = this.document.blocks.getParentId(ordered[0]!);
    const siblings = parent == null ? this.document.blocks.getRootIds() : this.document.blocks.getChildIds(parent);
    const previous = siblings[siblings.indexOf(ordered[0]!) - 1];
    if (previous) this.require(previous);
    this.document.blocks.indentBlocks([...ids]);
  }
  /** @param id - Local subtree to outdent. @throws At the panel boundary. */
  outdentBlock(id: string) { this.outdentBlocks([id]); }
  /** @param ids - Local sibling roots. @throws Before mutation if any outdent crosses the boundary. */
  outdentBlocks(ids: readonly string[]) {
    ids.forEach(id => { this.require(id, true); if (!this.canOutdent(id)) throw new Error('Cannot outdent outside panel'); });
    this.document.blocks.outdentBlocks([...ids]);
  }
}
