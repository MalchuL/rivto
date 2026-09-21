/**
 * Structural contracts for every manager exposed by RivtoEditorApi.
 * Concrete manager classes implement these interfaces; consumers depend only
 * on the contracts collected here.
 */
import type { DocumentHistoryManagerApi, DocumentModel } from "@chulane/document-model";
import type {
  EditorBlock,
  EditorBlockInput,
  EditorBlockNode,
  EditorBlockPatch,
  EditorBlockUpdate,
  EditorElement,
  EditorElementInput,
  EditorElementPatch,
  EditorElementUpdate,
} from "../editor/model";
import type { EditorMode } from "../editor/types";
import type { BlockProcessor } from "./block-manager/block-pipe";
import type { BlockPrepareErrorHandler } from "./block-manager/types";
import type { BlockListPropsManagerApi } from "./block-list-props-manager";
import type { BlockDefinition } from "./block-registry-manager/types";
import type { ClipboardBundle, ClipboardPasteInput } from "./clipboard-manager/clipboard-data";
import type { PasteStrategyRegistry } from "./clipboard-manager/strategies";
import type { ElementProcessor } from "./element-manager/element-pipe";
import type { ResolvedSelection } from "./selection-manager/resolved-selection";
import type { EditorPosition, Selection } from "./selection-manager/selection";

/** Function accepted by the command registry. */
export type CommandHandler = (payload?: unknown) => unknown;

/** Ownership handle for one command registration. */
export interface RegisteredCommand {
  /** Stable registered command ID. */
  readonly name: string;
  /** @param payload - Optional command data. @returns The handler result. */
  execute(payload?: unknown): unknown;
  /** @returns No value after releasing this registration. */
  dispose(): void;
}

/** Public command registry contract. */
export interface CommandRegistryApi {
  readonly lastExecuted: string | null;
  /** @param name - Command ID. @param handler - Runtime handler. @returns Registration handle. */
  register(name: string, handler: CommandHandler): RegisteredCommand;
  /** @param name - Command ID. @returns Whether it is registered. */
  has(name: string): boolean;
  /** @param name - Command ID. @returns No value. */
  remove(name: string): void;
  /** @param name - Command ID. @param payload - Optional data. @returns Handler result. */
  execute(name: string, payload?: unknown): unknown;
  /** @param listener - Execution listener. @returns Its disposer. */
  subscribe(listener: () => void): () => void;
  /** @returns No value after clearing registrations and listeners. */
  clear(): void;
}

/** Result of importing a detached block forest. */
export interface ImportedBlockForest {
  /** Complete persisted destination roots in source order. */
  readonly roots: EditorBlock[];
  /** Source-to-destination ID mapping. */
  readonly idMap: ReadonlyMap<string, string>;
}

/** Public typed block-operation contract. */
export interface BlockManagerApi {
  /** Monotonic active-document block revision. */
  readonly revision: number;
  /** @param processor - Editor-owned processor. @returns Its disposer. */
  registerProcessor(processor: BlockProcessor): () => void;
  /** @param id - Block ID. @returns Whether the block exists. */
  hasBlock(id: string): boolean;
  /** @param id - Block ID. @returns Detached subtree or undefined. */
  getBlock(id: string): EditorBlock | undefined;
  /** @param id - Block ID. @returns Detached non-recursive block fields or undefined. */
  getBlockNode(id: string): EditorBlockNode | undefined;
  /** @returns Complete detached root forest. */
  getBlocks(): EditorBlock[];
  /** @returns Root block IDs in document order. */
  getRootIds(): string[];
  /** @param id - Block ID. @param listener - Change listener. @returns Its disposer. */
  subscribeBlock(id: string, listener: () => void): () => void;
  /** @param id - Block ID. @param listener - Node change listener. @returns Its disposer. */
  subscribeBlockNode(id: string, listener: () => void): () => void;
  /** @param id - Parent ID. @param listener - Direct child-ID listener. @returns Its disposer. */
  subscribeChildIds(id: string, listener: () => void): () => void;
  /** @param listener - Root-list listener. @returns Its disposer. */
  subscribeRootIds(listener: () => void): () => void;
  /** @param listener - Structure listener. @returns Its disposer. */
  subscribeStructure(listener: () => void): () => void;
  /** @param document - Active document. @returns No value. */
  setDocument(document: DocumentModel): void;
  /** @returns No value after refreshing retained subscriptions. */
  refreshSubscriptions(): void;
  /** @param input - Detached root forest. @param onError - Optional one-shot node recovery. @returns Recursively prepared creation forest. */
  prepareInput(
    input: readonly (EditorBlock | EditorBlockInput)[],
    onError?: BlockPrepareErrorHandler,
  ): EditorBlockInput[];
  /** @param id - Parent ID. @returns Direct child IDs. */
  getChildIds(id: string): string[];
  /** @param id - Parent ID. @returns True when the block has at least one child. */
  hasChildren(id: string): boolean;
  /** @param id - Block ID. @returns Parent ID, null, or undefined. */
  getParentId(id: string): string | null | undefined;
  /** @param id - Block ID. @returns True when the block exists and has no parent. */
  isRootBlock(id: string): boolean;
  /** @param block - Creation input. @param afterId - Placement anchor. @returns Complete persisted block. */
  insertBlock(block: EditorBlockInput, afterId?: string | null): EditorBlock;
  /** @param blocks - Complete copied roots or creation inputs. @param afterId - Placement anchor. @param onError - Optional one-shot node recovery. @returns Imported roots and identities. */
  importForest(
    blocks: readonly (EditorBlock | EditorBlockInput)[],
    afterId?: string | null,
    onError?: BlockPrepareErrorHandler,
  ): ImportedBlockForest;
  /** @param id - Block ID. @param patch - Mutable fields. @returns Updated non-recursive block fields. */
  updateBlock(id: string, patch: EditorBlockPatch): EditorBlockNode;
  /** @param updates - Identified patches. @returns Updated non-recursive block fields in input order. */
  updateBlocks(updates: readonly EditorBlockUpdate[]): EditorBlockNode[];
  /** @param id - Block ID. @param keys - Keys to delete. @returns Whether deletion applied. */
  deleteListProps(id: string, keys: readonly string[]): boolean;
  /** @param updates - Identified key deletions. @returns No value. */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void;
  /** @param id - Block ID to clear. @returns No value. */
  clearBlock(id: string): void;
  /** @param id - Block ID. @param type - Destination type. @returns No value. */
  setBlockType(id: string, type: string): void;
  /** @param id - Block ID to remove. @returns No value. */
  removeBlock(id: string): void;
  /** @param ids - Block IDs to remove. @returns No value. */
  removeBlocks(ids: string[]): void;
  /** @param targetId - Surviving block. @param sourceId - Removed source. @returns Merge offset. */
  mergeBlocks(targetId: string, sourceId: string): number;
  /** @param id - Moving block. @param targetId - Destination. @param position - Placement. @returns No value. */
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;
  /** @param ids - Moving roots. @param targetId - Destination. @param position - Placement. @returns No value. */
  moveBlocks(ids: string[], targetId: string | null, position?: "before" | "after" | "inside"): void;
  /** @param id - Block ID. @returns No value. */
  indentBlock(id: string): void;
  /** @param ids - Block IDs. @returns No value. */
  indentBlocks(ids: string[]): void;
  /** @param id - Block ID. @returns No value. */
  outdentBlock(id: string): void;
  /** @param ids - Block IDs. @returns No value. */
  outdentBlocks(ids: string[]): void;
  /** @param id - Block ID. @param key - Property key. @param value - New value. @returns No value. */
  setBlockProp(id: string, key: string, value: unknown): void;
  /** @param id - Block ID. @param pluginId - Namespace. @param value - New value. @returns No value. */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void;
  /** @returns No value after releasing processors and subscriptions. */
  destroy(): void;
}

export type { BlockListPropsManagerApi };

/** Public native block-definition registry contract. */
export interface BlockRegistryManagerApi {
  /** @param definition - Native type definition. @returns Its disposer. */
  defineBlock(definition: BlockDefinition): () => void;
  /** @param listener - Registry listener. @returns Its disposer. */
  subscribe(listener: () => void): () => void;
  /** @param type - Native type. @returns Its definition or undefined. */
  get(type: string): BlockDefinition | undefined;
  /** @param type - Native type. @returns Whether it is defined. */
  has(type: string): boolean;
  /** @param input - Creation input. @returns Prepared input. */
  prepare(input: EditorBlockInput): EditorBlockInput;
  /** @param type - Destination type. @param current - Existing props. @returns Prepared props. */
  prepareTypeChange(type: string, current: Record<string, unknown>): Record<string, unknown>;
  /** @param type - Native type. @param props - Candidate props. @returns Validated props. */
  validate(type: string, props: Record<string, unknown>): Record<string, unknown>;
  /** @returns No value after releasing definitions. */
  destroy(): void;
}

/** Public first-class element-operation contract. */
export interface ElementManagerApi {
  /** @param processor - Editor-owned processor. @returns Its disposer. */
  registerProcessor(processor: ElementProcessor): () => void;
  /** @param id - Element ID. @returns Whether the element exists. */
  hasElement(id: string): boolean;
  /** @param id - Element ID. @returns Detached element or undefined. */
  getElement(id: string): EditorElement | undefined;
  /** @returns Every detached element. */
  getElements(): EditorElement[];
  /** @param listener - Collection listener. @returns Its disposer. */
  subscribe(listener: () => void): () => void;
  /** @param id - Element ID. @param listener - Change listener. @returns Its disposer. */
  subscribeElement(id: string, listener: () => void): () => void;
  /** @param listener - Membership listener. @returns Its disposer. */
  subscribeMembership(listener: () => void): () => void;
  /** @param document - Active document. @returns No value. */
  setDocument(document: DocumentModel): void;
  /** @returns No value after refreshing retained subscriptions. */
  refreshSubscriptions(): void;
  /** @param input - Creation input. @returns Complete persisted element. */
  insertElement(input: EditorElementInput): EditorElement;
  /** @param sourceIds - Source IDs. @returns Destination identity map. */
  createImportIdMap(sourceIds: readonly string[]): ReadonlyMap<string, string>;
  /** @param id - Element ID. @param patch - Mutable fields. @returns Complete persisted element. */
  updateElement(id: string, patch: EditorElementPatch): EditorElement;
  /** @param updates - Identified patches. @returns Complete persisted elements in input order. */
  updateElements(updates: readonly EditorElementUpdate[]): EditorElement[];
  /** @param id - Element ID. @returns No value. */
  removeElement(id: string): void;
  /** @param ids - Element IDs. @returns No value. */
  removeElements(ids: readonly string[]): void;
  /** @returns No value after releasing processors and subscriptions. */
  destroy(): void;
}

/** Public clipboard-operation contract. */
export interface ClipboardManagerApi {
  /** Ordered paste strategies owned by this clipboard manager. */
  readonly pasteStrategies: PasteStrategyRegistry;
  /** @param selection - Optional selection override. @returns Clipboard bundle or undefined. */
  copy(selection?: Selection): ClipboardBundle | undefined;
  /** @param selection - Text selection. @returns Clipboard bundle or undefined. */
  copyText(selection: Selection): ClipboardBundle | undefined;
  /** @returns Copied bundle or undefined after deleting the selection. */
  cut(): ClipboardBundle | undefined;
  /** @param input - Clipboard flavors and placement. @returns Resulting caret or undefined. */
  paste(input?: ClipboardPasteInput): EditorPosition | undefined;
}

/** Public local mode contract. */
export interface ModeManagerApi {
  /** @returns Active local editor mode. */
  get(): EditorMode;
  /** @param mode - Next mode. @returns No value. */
  set(mode: EditorMode): void;
  /** @param listener - Mode listener. @returns Its disposer. */
  subscribe(listener: () => void): () => void;
}

/** Public local selection contract. */
export interface SelectionManagerApi {
  /** @returns Detached current selection. */
  get(): Selection | undefined;
  /** @returns Stable selection snapshot. */
  snapshot(): Selection | undefined;
  /** @param id - Block ID. @returns Whether it has structural coverage. */
  isBlockSelected(id: string): boolean;
  /** @param id - Element ID. @returns Whether it is selected. */
  isElementSelected(id: string): boolean;
  /** @param selection - Optional selection override. @returns Resolved live selection. */
  resolveBlockSelection(selection?: Selection): ResolvedSelection | undefined;
  /** @param selection - New local selection. @returns No value. */
  set(selection: Selection): void;
  /** @returns No value after deleting selected content. */
  delete(): void;
  /** @returns No value after clearing selection. */
  clear(): void;
  /** @param listener - Selection listener. @returns Its disposer. */
  subscribe(listener: () => void): () => void;
}

/** Public document-history and transaction contract. */
export interface HistoryManagerApi {
  /** @param manager - Active document history. @returns No value. */
  setDocument(manager: DocumentHistoryManagerApi): void;
  /** @param operation - Captured operation. @returns Its result. */
  batchUpdates<Result>(operation: () => Result): Result;
  /** @param operation - Untracked operation. @returns Its result. */
  batchUpdatesWithoutHistory<Result>(operation: () => Result): Result;
  /** @returns No value after undoing. */
  undo(): void;
  /** @returns No value after redoing. */
  redo(): void;
  /** @returns No value after clearing history. */
  clear(): void;
  /** @returns No value after ending the current capture group. */
  stopCapturing(): void;
}
