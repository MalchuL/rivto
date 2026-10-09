/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type { BlockDropDestination } from "./views/types";
import type {
  BlockDefinition,
  BlockListPropsManagerApi,
  BlockPrepareErrorHandler,
  ClipboardBundle,
  ClipboardPasteInput,
  EditorBlock,
  EditorBlockInput,
  EditorBlockNode,
  EditorBlockPatch,
  EditorBlockUpdate,
  EditorMode,
  EditorPosition,
  PasteStrategyRegistry,
  Selection,
} from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import type { BlockWrapperComponent } from "./blocks";
import type {
  BlockRenderer,
  DOMEventDefinition,
  DOMEventName,
  DOMEventTarget,
  EditorEvent,
  EditorEventHandler,
  ExtensionComponent,
  ExtensionMountPosition,
  KeyboardBindingSnapshot,
  KeyboardEditorEvent,
  KeyboardEventDefinition,
  KeyboardShortcut,
  KeymapOverrides,
  PortableBlockFormats,
  ReactBlockRegistration,
  ReactEditorExtension,
  ClipboardFormatter,
  ClipboardParser,
  SlashCommand,
  SurfaceComponent,
  ResolvedSlot,
  BlockSlotPosition,
  BlockSlotProps,
  BlockSlotRegistration,
  ElementSlotProps,
  ElementSlotRegistration,
  SlotPosition,
} from "./managers";
import type { BlockViewAction, BlockViewBehavior, BlockViewContext } from "./views/types";

export interface BlocksCapability {
  /**
   * Delegates complete recursive creation preparation to the core block manager.
   *
   * Applies definitions, list policy, processors, and validation to a detached block-input tree.
   *
   * @param input - Block forest to prepare without mutating the document.
   * @returns Recursively copied forest ready for a React block operation.
   * @throws {Error} When any definition, processor, or persisted value is invalid.
   */
  prepareInput(
    input: readonly (EditorBlock | EditorBlockInput)[],
    onError?: BlockPrepareErrorHandler,
  ): EditorBlockInput[];
  /**
   * Inserts a recursively prepared and validated block through the core editor.
   *
   * Prepares and inserts a block, returning the complete persisted subtree.
   *
   * @param input - Block subtree to receive active defaults and validation.
   * @param afterId - Sibling after which to insert, `null` for first position, or
   * omitted for the end of the root list.
   * @returns The complete persisted root block.
   * @throws {Error} When list properties are invalid or core insertion fails.
   */
  insertBlock(input: EditorBlockInput, afterId?: string | null): EditorBlock;
  /**
   * Applies one patch after core-owned list-property validation.
   *
   * Applies one valid patch and returns updated fields without descendants, or throws.
   *
   * @param id - Identifier of the block to update.
   * @param patch - Partial block fields to pass to the core manager.
   * @returns Updated block fields without descendants.
   * @throws {Error} When the block is missing or the operation is invalid.
   */
  updateBlock(id: string, patch: EditorBlockPatch): EditorBlockNode;
  /**
   * Applies an ordered patch batch through core validation.
   * Applies an entire valid patch batch and returns updated fields without descendants in input order, or throws.
   *
   * @param updates - Ordered identified patches to validate and apply atomically.
   * @returns Updated block fields without descendants, in input order.
   * @throws {Error} When any block is missing or any operation is invalid.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): EditorBlockNode[];
  /**
   * Deletes selected list-property keys after validating the resulting record.
   *
   * Deletes list-property keys and returns whether the mutation was applied.
   *
   * @param id - Identifier of the block to modify.
   * @param keys - Property names to remove.
   * @returns Whether any persisted property was deleted.
   * @throws {Error} When the block is missing or the operation is invalid.
   */
  deleteListProps(id: string, keys: readonly string[]): boolean;
  /**
   * Deletes list-property keys through core batch validation.
   * Deletes an entire valid key batch or throws.
   *
   * @param updates - Blocks and property names requested for deletion.
   * @returns No value after applying every deletion.
   * @throws {Error} When any block is missing or any operation is invalid.
   */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void;
  /** @returns Current core block revision.
   *
   * Current block revision used by React subscriptions.
   */
  readonly revision: number;
  /** @param id - Block identifier. @returns Whether the block exists.
   *
   * @param id - Block identifier. @returns Whether the block exists.
   */
  hasBlock(id: string): boolean;
  /** @returns One detached block, when present.
   *
   * @param id - Block identifier. @returns Detached subtree, or undefined when absent.
   */
  getBlock(id: string): EditorBlock | undefined;
  /** @returns Detached non-recursive block fields, when present.
   *
   * @param id - Block identifier. @returns Detached non-recursive block fields, or undefined when absent.
   */
  getBlockNode(id: string): EditorBlockNode | undefined;
  /** @returns The complete detached root forest.
   *
   * @returns The complete detached root forest.
   */
  getBlocks(): EditorBlock[];
  /** @returns Ordered root block identifiers.
   *
   * @returns Root block identifiers in document order.
   */
  getRootIds(): string[];
  /** @param ids - Candidate IDs. @returns Unique placed IDs in document order, omitting missing records. */
  getOrderedIds(ids: Iterable<string>): string[];
  /** Subscribes to one recursive block snapshot.
   *
   * Subscribes to one recursive block snapshot.
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked after relevant changes.
   * @returns Function that removes the subscription.
   */
  subscribeBlock(id: string, listener: () => void): () => void;
  /** Subscribes to one block's own fields and direct child IDs.
   *
   * Subscribes to one block's own fields and direct child IDs.
   */
  subscribeBlockNode(id: string, listener: () => void): () => void;
  /** Subscribes to ordered root identifiers.
   *
   * Subscribes to ordered root identifier changes.
   * @param listener - Callback invoked after root changes.
   * @returns Function that removes the subscription.
   */
  subscribeRootIds(listener: () => void): () => void;
  /** Subscribes to hierarchy changes.
   *
   * Subscribes to hierarchy changes.
   * @param listener - Callback invoked after hierarchy changes.
   * @returns Function that removes the subscription.
   */
  subscribeStructure(listener: () => void): () => void;
  /** @returns True when the block has at least one child.
   *
   * @param id - Parent block identifier. @returns True when the block has at least one child.
   */
  hasChildren(id: string): boolean;
  /** @returns A block's parent, root marker, or missing marker.
   *
   * @param id - Block identifier. @returns Parent ID, null at root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined;
  /** @returns True when the block exists and has no parent.
   *
   * @param id - Block identifier. @returns True when the block exists and has no parent.
   */
  isRootBlock(id: string): boolean;
  /** Imports a detached block forest with collision remapping.
   *
   * Imports a detached forest and reports its destination identities.
   * @param blocks - Complete copied roots or creation inputs to import.
   * @param afterId - Existing sibling to follow, null to prepend, or undefined to append.
   * @param onError - Optional one-shot replacement for a failed block.
   * @returns Complete persisted roots and source-to-destination ID mapping.
   */
  importForest(
    blocks: readonly (EditorBlock | EditorBlockInput)[],
    afterId?: string | null,
    onError?: BlockPrepareErrorHandler,
  ): { roots: EditorBlock[]; idMap: ReadonlyMap<string, string> };
  /** Clears one block while preserving its identity.
   *
   * @param id - Block identifier to clear. @returns No value.
   */
  clearBlock(id: string): void;
  /** Converts one block to a registered type.
   *
   * @param id - Block identifier. @param type - Destination block type. @returns No value.
   */
  setBlockType(id: string, type: string): void;
  /** Removes one block subtree.
   *
   * @param id - Block identifier to remove. @returns No value.
   */
  removeBlock(id: string): void;
  /** Removes several block subtrees atomically.
   *
   * @param ids - Block subtree roots to remove. @returns No value.
   */
  removeBlocks(ids: readonly string[]): void;
  /** Merges source content and children into the target.
   *
   * Merges a source block into a target.
   * @param targetId - Destination block identifier.
   * @param sourceId - Source block identifier.
   * @returns Resulting caret offset in the target.
   */
  mergeBlocks(targetId: string, sourceId: string): number;
  /** Moves one block relative to a target.
   *
   * Moves one block relative to a destination.
   * @param id - Block identifier to move.
   * @param targetId - Destination block, or null for the list start.
   * @param position - Relationship to the destination.
   * @returns No value.
   */
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;
  /** Moves several block roots as one group.
   *
   * Moves several block roots relative to one destination.
   * @param ids - Ordered block roots to move.
   * @param targetId - Destination block, or null for the list start.
   * @param position - Relationship to the destination.
   * @returns No value.
   */
  moveBlocks(ids: readonly string[], targetId: string | null, position?: "before" | "after" | "inside"): void;
  /** Indents one block when eligible.
   *
   * @param id - Block identifier to indent. @returns No value.
   */
  indentBlock(id: string): void;
  /** Indents a block range when eligible.
   *
   * @param ids - Ordered block roots to indent. @returns No value.
   */
  indentBlocks(ids: readonly string[]): void;
  /** Outdents one block when eligible.
   *
   * @param id - Block identifier to outdent. @returns No value.
   */
  outdentBlock(id: string): void;
  /** Outdents a block range when eligible.
   *
   * @param ids - Ordered block roots to outdent. @returns No value.
   */
  outdentBlocks(ids: readonly string[]): void;
  /** Sets one opaque block property.
   *
   * Sets or removes one native block property.
   * @param id - Block identifier.
   * @param key - Native property name.
   * @param value - Portable value, or undefined to remove it.
   * @returns No value.
   */
  setBlockProp(id: string, key: string, value: unknown): void;
  /** Sets namespaced block plugin data.
   *
   * Sets or removes one namespaced block plugin value.
   * @param id - Block identifier.
   * @param pluginId - Stable plugin namespace.
   * @param value - Portable value, or undefined to remove it.
   * @returns No value.
   */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void;
}

/** Atomic React block-type and presentation registration. */
export interface BlockTypesCapability {
  register(registration: ReactBlockRegistration): () => void;
  delete(type: string): boolean;
  /** Reports whether a registered type partitions root block elements. */
  separatesBlockElements(type: string): boolean;
  /** Returns the first separator type registered for automatic card creation. */
  getDefaultBlockElementSeparatorType(): string | undefined;
  /** Returns one registered native block definition. */
  getDefinition(type: string): BlockDefinition | undefined;
  /** Validates and returns native block properties. */
  validateBlockProps(type: string, props: Record<string, unknown>): Record<string, unknown>;
}

/** Core list-property policy whose registrations are owned by the active React extension. */
export type BlockListPropsRegistration = Parameters<BlockListPropsManagerApi["register"]>[0] & {
  /** Returns inherited properties for the following split block; omitted leaves writing defaults intact. */
  readonly prepareSplit?: (block: EditorBlock) => Record<string, unknown>;
  /** Handles a split before the ordinary outline action. True stops the fallback; the caller owns the transaction. */
  readonly onSplit?: (context: BlockViewContext) => boolean;
  /** Returns false to hide this block's children. Omitted leaves them visible. */
  readonly childrenVisible?: (block: Pick<EditorBlockNode, "listProps">) => boolean;
};

/** Core property validation combined with optional React outline behavior. */
export interface BlockListPropsCapability extends Omit<BlockListPropsManagerApi, "destroy" | "register"> {
  /** Registers property validation and presentation behavior together; returns their owned cleanup. */
  register(registration: BlockListPropsRegistration): () => void;
  /** Returns merged split properties in registration order, or undefined when no extension supplies them. */
  prepareSplit(block: EditorBlock): Record<string, unknown> | undefined;
  /** Runs split handlers in registration order until one handles the request. */
  onSplit(context: BlockViewContext): boolean;
  /** Returns true unless an installed behavior hides the block's children. */
  childrenVisible(block: Pick<EditorBlockNode, "listProps">): boolean;
}

/** React-owned registry for portable clipboard formatting and parsing. */
export interface ClipboardCapability {
  /** Core paste-strategy registry shared with React clipboard extensions. */
  readonly pasteStrategies: PasteStrategyRegistry;
  /** @param selection - Optional selection override. @returns Structured copy data, when available. */
  copy(selection?: Selection): ClipboardBundle | undefined;
  /** @param selection - Text selection to copy. @returns Structured copy data, when nonempty. */
  copyText(selection: Selection): ClipboardBundle | undefined;
  /** @returns Structured copied data, when a selection exists. */
  cut(): ClipboardBundle | undefined;
  /** @param input - Clipboard flavors and placement. @returns Resulting caret, when applicable. */
  paste(input?: ClipboardPasteInput): EditorPosition | undefined;
  /** Registers an ordered formatter and returns its lifecycle-owned disposer. */
  registerFormatter(formatter: ClipboardFormatter): () => void;
  /** Registers a first-match parser and returns its lifecycle-owned disposer. */
  registerParser(parser: ClipboardParser): () => void;
  /** Returns composed plain-text, Markdown, and HTML formats for a block forest. */
  format(blocks: readonly EditorBlock[]): PortableBlockFormats;
  /** Returns the first parsed block-input forest, or undefined when no parser matches. */
  parse(data: { readonly html: string; readonly text: string }): EditorBlockInput[] | undefined;
}

export interface RenderersCapability {
  register(type: string, renderer: BlockRenderer): () => void;
  delete(type: string): boolean;
  get(type: string): BlockRenderer | undefined;
  has(type: string): boolean;
  readonly revision: number;
  subscribe(listener: () => void): () => void;
}
/** Per-type outline, split, and drop behavior resolved by page dispatchers. */
export interface ViewsCapability {
  /**
   * Resolves the context block's behavior and falls back when it defers.
   * @param action - Semantic operation to invoke.
   * @param args - Block context and operation-specific arguments.
   * @returns True when the operation was handled or explicitly rejected.
   */
  dispatch<Action extends BlockViewAction>(action: Action, ...args: Parameters<BlockViewBehavior[Action]>): boolean;
  /** Registers one behavior object for a persisted block type. */
  register(type: string, view: BlockViewBehavior): () => void;
  /** Removes the view registered for a persisted block type. */
  delete(type: string): boolean;
  /** Returns the registered view, or `undefined` when the type is generic. */
  get(type: string): BlockViewBehavior | undefined;
  /** Reports whether a specialized view is registered for the type. */
  has(type: string): boolean;
  /** Resolves the view for a placed block, falling back to the generic view. */
  resolve(blockId: string): BlockViewBehavior;
  /** Validates source snapshots against the exact destination parent. */
  acceptsDrop(destination: BlockDropDestination, sources: readonly EditorBlock[]): boolean;
  /** Shared generic view used when a type registers no specialization. */
  readonly fallback: BlockViewBehavior;
}

export interface EventsCapability {
  register<
    Target extends DOMEventTarget = "surface",
    Type extends DOMEventName<Target> = DOMEventName<Target>,
  >(
    definition: DOMEventDefinition<Target, Type>,
    listener: EditorEventHandler<EditorEvent<Target, Type>>,
  ): () => void;
  delete(id: string): boolean;
  setRoot(root: HTMLElement | null): void;
  /** @returns This occurrence’s DOM root, or null before mounting and after cleanup. */
  getRoot(): HTMLElement | null;
  /**
   * Reads the rendered surface of this occurrence without changing shared document mode.
   * Unlike `editorRuntime.mode.get()`, which is shared by a document's views, this
   * describes the receiving DOM surface: a page embedding returns `block` even
   * when its document's core mode is `edgeless`. No additional mode is stored.
   * Event dispatch captures this value in `event.mode`; handlers should use that
   * snapshot. Use this method for view-specific commands outside event handlers,
   * and the core mode manager for document-wide presentation choices.
   * @returns Mounted view's surface type, or core mode when no recognized surface is mounted.
   */
  getSurfaceType(): EditorMode;

}

export interface KeyboardCapability {
  /** Registers one stable semantic action and returns its idempotent disposer. */
  register(
    definition: KeyboardEventDefinition,
    listener: EditorEventHandler<KeyboardEditorEvent>,
  ): () => void;
  /** Deletes a registered semantic action by ID. */
  delete(id: string): boolean;
  /** Returns an immutable snapshot of installed bindings and orphan overrides. */
  list(): readonly KeyboardBindingSnapshot[];
  /** Increments when registrations or overrides change. */
  readonly revision: number;
  /** Subscribes to inventory revisions. */
  subscribe(listener: () => void): () => void;
  /** Replaces every override, restoring defaults for omitted IDs. */
  replaceKeymap(keymap: KeymapOverrides): void;
  /** Sets one override; an empty array disables it and undefined restores defaults. */
  setKeymapOverride(
    id: string,
    keys: readonly KeyboardShortcut[] | undefined,
  ): void;
}

export interface SurfacesCapability {
  /** @returns Matching block slots with stable registration IDs, ordered by priority. */
  getBlockSlotEntries(position: BlockSlotPosition, props: BlockSlotProps): readonly ResolvedSlot<BlockSlotProps>[];
  /** @returns Matching element slots with stable registration IDs, ordered by priority. */
  getElementSlotEntries(position: SlotPosition, props: ElementSlotProps): readonly ResolvedSlot<ElementSlotProps>[];
  register(mode: EditorMode, surface: SurfaceComponent): () => void;
  delete(mode: EditorMode): boolean;
  get(mode: EditorMode): SurfaceComponent | undefined;
  registerBlockWrapper(mode: EditorMode, wrapper: BlockWrapperComponent): () => void;
  getBlockWrappers(mode: EditorMode): readonly BlockWrapperComponent[];
  /** Registers one ordered block-row slot contribution. */
  registerBlockSlot(registration: BlockSlotRegistration): () => void;
  /** Resolves matching block-slot components from nearest to farthest. */
  getBlockSlots(
    position: BlockSlotPosition,
    props: BlockSlotProps,
  ): readonly ComponentType<BlockSlotProps>[];
  /** Registers one ordered first-class element slot contribution. */
  registerElementSlot(registration: ElementSlotRegistration): () => void;
  /** Resolves matching element-slot components from nearest to farthest. */
  getElementSlots(
    position: SlotPosition,
    props: ElementSlotProps,
  ): readonly ComponentType<ElementSlotProps>[];
  registerEditorWrapper(
    wrapper: ComponentType<{ readonly children?: ReactNode }>,
    mode?: EditorMode | readonly EditorMode[],
  ): () => void;
  getEditorWrappers(mode: EditorMode): ComponentType<{ readonly children?: ReactNode }>[];
  readonly revision: number;
  subscribe(listener: () => void): () => void;
}

export interface SelectionCapability {
  get(): Selection | undefined;
  set(selection: Selection): void;
  clear(): void;
  subscribe(listener: () => void): () => void;
  delete(): void;
  /** Returns a detached snapshot of the current selection. */
  snapshot(): Selection | undefined;
  /** @param id - Block identifier. @returns Whether the block has structural coverage. */
  isBlockSelected(id: string): boolean;
  /** @param id - Element identifier. @returns Whether the element is selected. */
  isElementSelected(id: string): boolean;
  readDOM(): Selection | undefined;
  restoreDOM(selection?: Selection, options?: RestoreDOMSelectionOptions): boolean;
  /**
   * Runs the callback next frame only if the model selection has not changed since scheduling.
   * Reserve callbacks for caret, DOM selection, and associated editing focus;
   * each call replaces previous pending work for the same DOM root even if
   * selection is unchanged. Other views keep their own pending DOM requests.
   * Keep document mutations and independent UI operations outside this scheduler.
   * @param callback - Work to perform next frame while the scheduled selection remains current.
   * @param onCancel - Optional cleanup when newer state or teardown supersedes the work.
   * @returns Idempotent cancellation for the pending callback.
   */
  scheduleIfSelectionUnchanged(callback: () => void, onCancel?: () => void): () => void;
  /** Whether the current selection has a pending, still-valid callback in the next frame. */
  readonly hasPendingSelectionCallback: boolean;
}

/** Options for rebuilding a portable selection in the live browser DOM. */
export interface RestoreDOMSelectionOptions {
  /** False mounts virtual endpoints without navigating the viewport to them. */
  readonly scroll?: boolean;
}

export interface SlashCommandsCapability {
  readonly revision: number;
  register(command: SlashCommand): () => void;
  delete(id: string): boolean;
  /** Lists available commands for the block using this manager's bound editor view. */
  getAll(context: { blockId: string }): SlashCommand[];
  /** Executes the command for the block using this manager's bound editor view. */
  execute(id: string, context: { blockId: string }): void;
  subscribe(listener: () => void): () => void;
}

export interface ExtensionsCapability {
  mount(
    component: ExtensionComponent,
    position?: ExtensionMountPosition,
  ): () => void;
  getComponents(
    position?: ExtensionMountPosition,
  ): readonly ExtensionComponent[];
  /** Installs one extension after creation and returns its disposer. */
  install(extension: ReactEditorExtension): () => void;
  readonly revision: number;
  subscribe(listener: () => void): () => void;
}
