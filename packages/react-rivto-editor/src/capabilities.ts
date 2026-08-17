import type {
  EditorBlockInput,
  EditorBlockPatch,
  EditorBlockUpdate,
  EditorMode,
  EditorSelection,
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
  KeyboardEditorEvent,
  KeyboardEventDefinition,
  KeyboardShortcut,
  KeymapOverrides,
  ReactBlockRegistration,
  ListPropsRegistration,
  BlockMutationResult,
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

export interface BlocksCapability {
  register(registration: ReactBlockRegistration): () => void;
  /** Registers ordered list-property defaults and validation; returns a disposer. */
  registerListProps(registration: ListPropsRegistration): () => void;
  /** Returns whether the given list-property registration is active. */
  hasListProps(id: string): boolean;
  /** Returns whether core portability and every active validator accept the record. */
  validateListProps(candidate: import("@chulane/rivto").BlockListProps): boolean;
  /** Returns a detached recursive input with active defaults shallowly merged. */
  prepareBlock(input: EditorBlockInput): EditorBlockInput;
  /** Inserts a prepared block and returns its stable root identifier. */
  insertBlock(input: EditorBlockInput, afterId?: string | null): string;
  /** Applies a valid patch and returns whether the target was updated. */
  updateBlock(id: string, patch: EditorBlockPatch): boolean;
  /** Applies valid entries best-effort and returns every positional outcome. */
  updateBlocks(updates: readonly EditorBlockUpdate[]): BlockMutationResult;
  /** Deletes list-property keys and returns whether the mutation was applied. */
  deleteListProps(id: string, keys: readonly string[]): boolean;
  /** Deletes valid key batches best-effort and returns every positional outcome. */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): BlockMutationResult;
  delete(type: string): boolean;
  /** Reports whether a registered type partitions root block elements. */
  separatesBlockElements(type: string): boolean;
  /** Returns the first separator type registered for automatic card creation. */
  getDefaultBlockElementSeparatorType(): string | undefined;
}

/** React-owned registry for portable clipboard formatting and parsing. */
export interface ClipboardCapability {
  /** Registers an ordered formatter and returns its lifecycle-owned disposer. */
  registerFormatter(formatter: ClipboardFormatter): () => void;
  /** Registers a first-match parser and returns its lifecycle-owned disposer. */
  registerParser(parser: ClipboardParser): () => void;
  /** Returns composed plain-text, Markdown, and HTML formats for a block forest. */
  format(blocks: readonly import("@chulane/rivto").EditorBlock[]): import("./managers").PortableBlockFormats;
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
  readDOM(): EditorSelection | undefined;
  restoreDOM(selection?: EditorSelection): boolean;
  clearDOMHighlight(): void;
  updateDOMHighlight(selection?: EditorSelection): void;
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
  mount(component: ExtensionComponent): () => void;
  getComponents(): readonly ExtensionComponent[];
  readonly revision: number;
  subscribe(listener: () => void): () => void;
}
