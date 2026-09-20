/**
 * Editor interaction contracts and operations. Browser editing context is separate from core whole-block selection; document mutations use core managers.
 */
import type {
  BlockDefinition,
  BlockListPropsManagerApi,
  BlockPrepareErrorHandler,
  ClipboardBundle,
  ClipboardPasteInput,
  EditorBlock,
  EditorBlockInput,
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
  SlashCommandContext,
  SurfaceComponent,
  BlockSlotPosition,
  BlockSlotProps,
  BlockSlotRegistration,
  ElementSlotProps,
  ElementSlotRegistration,
  SlotPosition,
} from "./managers";
import type { BlockViewBehavior } from "./views/types";

export interface BlocksCapability {
  /** Applies definitions, list policy, processors, and validation to a detached block-input tree. */
  prepareInput(
    input: readonly (EditorBlock | EditorBlockInput)[],
    onError?: BlockPrepareErrorHandler,
  ): EditorBlockInput[];
  /** Prepares and inserts a block, returning its complete persisted root. */
  insertBlock(input: EditorBlockInput, afterId?: string | null): EditorBlock;
  /** Applies one valid patch and returns the complete persisted block, or throws. */
  updateBlock(id: string, patch: EditorBlockPatch): EditorBlock;
  /** Applies an entire valid patch batch and returns complete persisted blocks in input order, or throws. */
  updateBlocks(updates: readonly EditorBlockUpdate[]): EditorBlock[];
  /** Deletes list-property keys and returns whether the mutation was applied. */
  deleteListProps(id: string, keys: readonly string[]): boolean;
  /** Deletes an entire valid key batch or throws. */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): void;
  /** Current block revision used by React subscriptions. */
  readonly revision: number;
  /** @param id - Block identifier. @returns Detached subtree, or undefined when absent. */
  getBlock(id: string): EditorBlock | undefined;
  /** @returns The complete detached root forest. */
  getBlocks(): EditorBlock[];
  /** @returns Root block identifiers in document order. */
  getRootIds(): string[];
  /**
   * Subscribes to one recursive block snapshot.
   * @param id - Block identifier to observe.
   * @param listener - Callback invoked after relevant changes.
   * @returns Function that removes the subscription.
   */
  subscribeBlock(id: string, listener: () => void): () => void;
  /**
   * Subscribes to ordered root identifier changes.
   * @param listener - Callback invoked after root changes.
   * @returns Function that removes the subscription.
   */
  subscribeRootIds(listener: () => void): () => void;
  /**
   * Subscribes to hierarchy changes.
   * @param listener - Callback invoked after hierarchy changes.
   * @returns Function that removes the subscription.
   */
  subscribeStructure(listener: () => void): () => void;
  /** @param id - Parent block identifier. @returns Direct child identifiers in document order. */
  getChildIds(id: string): string[];
  /** @param id - Block identifier. @returns Parent ID, null at root, or undefined when absent. */
  getParentId(id: string): string | null | undefined;
  /**
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
  /** @param id - Block identifier to clear. @returns No value. */
  clearBlock(id: string): void;
  /** @param id - Block identifier. @param type - Destination block type. @returns No value. */
  setBlockType(id: string, type: string): void;
  /** @param id - Block identifier to remove. @returns No value. */
  removeBlock(id: string): void;
  /** @param ids - Block subtree roots to remove. @returns No value. */
  removeBlocks(ids: readonly string[]): void;
  /**
   * Merges a source block into a target.
   * @param targetId - Destination block identifier.
   * @param sourceId - Source block identifier.
   * @returns Resulting caret offset in the target.
   */
  mergeBlocks(targetId: string, sourceId: string): number;
  /**
   * Moves one block relative to a destination.
   * @param id - Block identifier to move.
   * @param targetId - Destination block, or null for the list start.
   * @param position - Relationship to the destination.
   * @returns No value.
   */
  moveBlock(id: string, targetId: string | null, position?: "before" | "after" | "inside"): void;
  /**
   * Moves several block roots relative to one destination.
   * @param ids - Ordered block roots to move.
   * @param targetId - Destination block, or null for the list start.
   * @param position - Relationship to the destination.
   * @returns No value.
   */
  moveBlocks(ids: readonly string[], targetId: string | null, position?: "before" | "after" | "inside"): void;
  /** @param id - Block identifier to indent. @returns No value. */
  indentBlock(id: string): void;
  /** @param ids - Ordered block roots to indent. @returns No value. */
  indentBlocks(ids: readonly string[]): void;
  /** @param id - Block identifier to outdent. @returns No value. */
  outdentBlock(id: string): void;
  /** @param ids - Ordered block roots to outdent. @returns No value. */
  outdentBlocks(ids: readonly string[]): void;
  /**
   * Sets or removes one native block property.
   * @param id - Block identifier.
   * @param key - Native property name.
   * @param value - Portable value, or undefined to remove it.
   * @returns No value.
   */
  setBlockProp(id: string, key: string, value: unknown): void;
  /**
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
export type BlockListPropsCapability = Omit<BlockListPropsManagerApi, "destroy">;

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
  /** Asks the target view whether it accepts the dragged roots. */
  acceptsDrop(targetId: string, sourceIds: readonly string[]): boolean;
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
  getRoot(): HTMLElement | null;
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
  restoreDOM(selection?: Selection): boolean;
}

export interface SlashCommandsCapability {
  readonly revision: number;
  register(command: SlashCommand): () => void;
  delete(id: string): boolean;
  getAll(context: SlashCommandContext): SlashCommand[];
  execute(id: string, context: SlashCommandContext): void;
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
