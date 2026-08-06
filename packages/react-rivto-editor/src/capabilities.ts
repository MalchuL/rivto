import type {
  EditorMode,
  EditorSelection,
  SlashCommand,
  SlashCommandContext,
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
  SurfaceComponent,
} from "./managers";

export interface BlocksCapability {
  register(registration: ReactBlockRegistration): () => void;
  delete(type: string): boolean;
  /** Reports whether a registered type partitions root block elements. */
  separatesBlockElements(type: string): boolean;
  /** Returns the first separator type registered for automatic card creation. */
  getDefaultBlockElementSeparatorType(): string | undefined;
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
