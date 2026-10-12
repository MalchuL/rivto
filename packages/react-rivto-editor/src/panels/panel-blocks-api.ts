import type { PanelBlocks } from './panel-blocks';
/** Explicit public block operations of a panel; storage and lifecycle stay document-owned. */
export interface PanelBlocksAPI {
  /** @returns Document block revision, used to invalidate panel membership checks. */
  readonly revision: PanelBlocks['revision'];
  /** @param id - Candidate identity. @returns Whether it is currently inside the panel. */
  readonly hasBlock: PanelBlocks['hasBlock'];
  /** @param id - Identity to read. @returns Own fields or undefined outside the panel. */
  readonly getBlockNode: PanelBlocks['getBlockNode'];
  /** @param id - Identity to read. @returns Recursive snapshot or undefined outside the panel. */
  readonly getBlock: PanelBlocks['getBlock'];
  /** @returns Stable ordered top-level IDs: children for EditorPanel, the protected root for EditorEmbed, or document roots. Empty while its selected root is absent. */
  readonly getRootIds: PanelBlocks['getRootIds'];
  /** @returns Recursive snapshots of this panel's current roots. */
  readonly getBlocks: PanelBlocks['getBlocks'];
  /** @param id - Local parent. @returns Its direct children or empty outside the panel. */
  readonly getChildIds: PanelBlocks['getChildIds'];
  /** @param id - Local parent. @returns Whether it has children. */
  readonly hasChildren: PanelBlocks['hasChildren'];
  /** @param id - Candidate block. @returns Local parent, null at the panel's top level, or undefined outside. */
  readonly getParentId: PanelBlocks['getParentId'];
  /** @param id - Candidate block. @returns Whether it is a displayed root. */
  readonly isRootBlock: PanelBlocks['isRootBlock'];
  /** @param ids - Candidate IDs. @returns Local IDs in document order. */
  readonly getOrderedIds: PanelBlocks['getOrderedIds'];
  /** @param listener - Root-list observer. @returns Cleanup; payload edits do not notify unchanged roots. */
  readonly subscribeRootIds: PanelBlocks['subscribeRootIds'];
  /** @param listener - Structural observer. @returns Cleanup for document placement changes affecting membership. */
  readonly subscribeStructure: PanelBlocks['subscribeStructure'];
  /** @param id - Candidate subtree. @param listener - Observer. @returns Cleanup, including entry/exit notifications. */
  readonly subscribeBlock: PanelBlocks['subscribeBlock'];
  /** @param id - Candidate node. @param listener - Observer. @returns Cleanup; descendant payload changes do not notify. */
  readonly subscribeBlockNode: PanelBlocks['subscribeBlockNode'];
  /** @param id - Candidate identity. @returns Whether deletion/movement is allowed by the panel boundary. */
  readonly canRemove: PanelBlocks['canRemove'];
  /** @param id - Candidate identity. @returns Whether outdent stays within the panel. */
  readonly canOutdent: PanelBlocks['canOutdent'];
  /** @param afterId - Local sibling, null to prepend, or omitted to append. @returns Explicit panel destination. @throws If insertion would escape the panel. */
  readonly getInsertionDestinationAfter: PanelBlocks['getInsertionDestinationAfter'];
  /** @param input - Validated creation input. @param destination - Panel root or local parent. @returns Inserted subtree. @throws Before writes for an invalid destination or input. */
  readonly insertBlock: PanelBlocks['insertBlock'];
  /** @param input - Detached forest. @param onError - Optional preparation recovery. @returns Prepared inputs without changing the document. */
  readonly prepareInput: PanelBlocks['prepareInput'];
  /** @param id - Local block. @param patch - Mutable fields. @returns Updated node. @throws Before writing outside the panel. */
  readonly updateBlock: PanelBlocks['updateBlock'];
  /** @param updates - Ordered local patches. @returns Updated nodes. @throws Before writes if any target is outside. */
  readonly updateBlocks: PanelBlocks['updateBlocks'];
  /** @param id - Local block. @param keys - List keys to remove. @returns Whether anything changed. */
  readonly deleteListProps: PanelBlocks['deleteListProps'];
  /** @param updates - Local list-property removals. @throws Before writing for any outside target. */
  readonly deleteListPropsBatch: PanelBlocks['deleteListPropsBatch'];
  /** @param id - Local block whose content is cleared while preserving identity. */
  readonly clearBlock: PanelBlocks['clearBlock'];
  /** @param id - Local block. @param type - Registered destination type. */
  readonly setBlockType: PanelBlocks['setBlockType'];
  /** @param id - Local block. @param key - Property key. @param value - Validated value or undefined to remove. */
  readonly setBlockProp: PanelBlocks['setBlockProp'];
  /** @param id - Local block. @param pluginId - Namespace. @param value - Portable plugin data. */
  readonly setBlockPluginData: PanelBlocks['setBlockPluginData'];
  /** @param id - Local subtree to remove. @throws If outside or the protected embedding root. */
  readonly removeBlock: PanelBlocks['removeBlock'];
  /** @param ids - Local subtrees. @throws Before any write if a target is outside or protected. */
  readonly removeBlocks: PanelBlocks['removeBlocks'];
  /** @param targetId - Surviving local block. @param sourceId - Removed local block. @returns Caret offset after merging. */
  readonly mergeBlocks: PanelBlocks['mergeBlocks'];
  /** @param id - Local subtree. @param targetId - Local destination or panel list start. @param position - Placement relative to target. */
  readonly moveBlock: PanelBlocks['moveBlock'];
  /** @param ids - Local subtrees. @param targetId - Local destination or panel list start. @param position - Placement. @throws Before writes for an outside or protected target. */
  readonly moveBlocks: PanelBlocks['moveBlocks'];
  /** @param id - Local subtree to indent. */
  readonly indentBlock: PanelBlocks['indentBlock'];
  /** @param ids - Local sibling roots. @throws If indent could adopt an outside sibling. */
  readonly indentBlocks: PanelBlocks['indentBlocks'];
  /** @param id - Local subtree to outdent. @throws At the panel boundary. */
  readonly outdentBlock: PanelBlocks['outdentBlock'];
  /** @param ids - Local sibling roots. @throws Before mutation if any outdent crosses the boundary. */
  readonly outdentBlocks: PanelBlocks['outdentBlocks'];
  /** Whether the selected block itself is displayed and protected. */
  /** Imports a copied forest directly into a validated panel destination. */
  readonly importForest: PanelBlocks["importForest"];
  readonly includeRoot: boolean;
}
