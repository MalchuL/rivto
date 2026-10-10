import { BlockListPropsManager } from "../managers/blocks/block-list-props-manager";
import { EditorViewRegistry } from "../managers/events/editor-view-registry";
/**
 * React runtime coordinator.
 *
 * Concrete registration state belongs to focused managers. EditorRuntime only
 * wires those managers around one core editor, installs extensions, and owns
 * final destruction ordering.
 *
 * @module
 */
import type { DocumentModel } from "@chulane/document-model";
import type {
  CommandRegistryApi,
  ElementManagerApi,
  HistoryManagerApi,
  ModeManagerApi,
  RivtoEditorApi,
} from "@chulane/rivto";
import { BlockElementProjection } from "../elements/block-element-projection";
import type { CreateDefaultBlock, IsEmptyBlock } from "../extensions/built-ins/page/default-writing-block/index";
import type { BlockBehaviorsApi } from "../managers/blocks/block-behaviors-api";
import type { BlockListPropsApi } from "../managers/blocks/block-list-props-api";
import type { BlockTypesApi } from "../managers/blocks/block-types-api";
import type { BlocksApi } from "../managers/blocks/blocks-api";
import type { RenderersApi } from "../managers/blocks/renderers-api";
import type { ExtensionsApi } from "../managers/extensions/api";
import {
  BlockBehaviorRegistry,
  BlockTypeManager,
  ClipboardFormatRegistry,
  ClipboardManager,
  EventManager,
  ExtensionManager,
  KeyboardManager,
  RendererManager,
  SlashCommandRegistry,
  SurfaceManager,
  type ReactEditorExtension,
  type RegistrationDisposer,
} from "../managers/index";
import type { SurfacesApi } from "../managers/surfaces/api";
import type { CreateEditorRuntimeOptions } from "./types";

export type { CreateEditorRuntimeOptions } from "./types";

const WRITING_NOT_INSTALLED =
  "Install defaultWritingBlockExtension (or call installDefaultWriting) before using writing factories";

/** Internal extension lifecycle required by collaborating managers. */
interface RuntimeExtensionsApi extends ExtensionsApi {
  initialize(extensions: readonly ReactEditorExtension[]): void;
  own(release: RegistrationDisposer): RegistrationDisposer;
  assertActive(): void;
}

/**
 * Shares one document's managers and extension registrations across its EditorViews.
 *
 * The supplied core editor provides blocks, elements, history, commands, mode, and
 * portable selection. React managers add rendering, browser event handling, block
 * behaviors, clipboard formats, and slash-command definitions. Extensions receive
 * this fully constructed runtime during setup and register their contributions once.
 *
 * Each EditorViewController supplies its own DOM root, selection operations, and
 * clipboard/slash execution. Access shared operations through editorView.runtime.
 * Destroying this runtime releases React resources in dependency order; the caller
 * or EditorStorage still owns destruction of the core editor and document model.
 */
export class EditorRuntime {
  /** Framework-neutral core permanently bound to this document and its managers. */
  private readonly editor: RivtoEditorApi;
  /** Creates and updates document elements, including canvas objects, through the core element manager.
   * The underlying core editor remains private; every view uses this same manager. */
  readonly elements: ElementManagerApi;
  /** Core presentation mode shared by this document's views and local to this editor.
   * A particular DOM surface may differ, such as a page embedding inside an edgeless view. */
  readonly mode: ModeManagerApi;
  /** Named core commands registered and invoked by extensions.
   * The manager is shared by all views without exposing the underlying core editor. */
  readonly commands: CommandRegistryApi;
  /** Core undo/redo history and synchronous transaction batching for this editor.
   * All views of the document share this local history; other editors keep their own. */
  readonly history: HistoryManagerApi;
  /** Creates input for an empty writing block using the installed writing extension.
   *
   * Enter, trailing insertion, separators, and clipboard operations share this factory.
   * The host configures it through {@link installDefaultWriting}.
   *
   * Throws until {@link installDefaultWriting} runs.
   */
  createDefaultBlock: CreateDefaultBlock = () => {
    throw new Error(WRITING_NOT_INSTALLED);
  };
  /** Checks whether a block is an empty writing block according to the installed extension.
   *
   * Enter outdent, list reset, and related operations share this predicate.
   * The host configures it through {@link installDefaultWriting}.
   *
   * Throws until {@link installDefaultWriting} runs.
   */
  isEmptyBlock: IsEmptyBlock = () => {
    throw new Error(WRITING_NOT_INSTALLED);
  };
  /** Content renderers indexed by persisted block type. */
  readonly renderers: RenderersApi;
  /** Per-type outline and drop behavior resolved by page dispatchers. */
  readonly blockBehaviors: BlockBehaviorsApi;
  /** Guarded mutations and delegated core block operations. */
  readonly blocks: BlocksApi;
  /** Atomic React block-type and presentation registration. */
  readonly blockTypes: BlockTypesApi;
  /** Registers list-property validation and keyboard behavior with the core policy manager.
   * Registrations are removed when their React extension is disposed. */
  readonly blockListProps: BlockListPropsApi;
  /** React-owned portable clipboard formatter and parser registry. */
  readonly clipboardFormats: ClipboardFormatRegistry;
  /** Structured document operations; view-dependent paste receives its destination explicitly. */
  readonly clipboard: ClipboardManager;
  /** Core paste strategies extended by React clipboard integrations. */
  readonly pasteStrategies: RivtoEditorApi["clipboard"]["pasteStrategies"];
  /** Root surfaces and their ordered block/editor wrappers. */
  readonly surfaces: SurfacesApi;
  /** Extension setup, mounted UI, registration ownership, and cleanup. */
  readonly extensions: RuntimeExtensionsApi;
  /** Delegated surface/document/window DOM event runtime. */
  readonly events: EventManager;
  /** Mounted occurrences and explicit active/default view lookup. */
  readonly editorViews: EditorViewRegistry;
  /** Semantic keyboard bindings and runtime keymap overrides. */
  readonly keyboard: KeyboardManager;
  /** Model selection shared by occurrences; DOM adapters belong to each EditorViewApi. */
  readonly selection: RivtoEditorApi["selection"];
  /** React-owned slash-command registry. */
  readonly slashCommands: SlashCommandRegistry;
  private destroyed = false;
  /** Maintains the document's block elements and their default canvas geometry.
   * Mounted surfaces share this projection instead of rebuilding it independently. */
  readonly blockElements: BlockElementProjection;
  /** Cleanup callbacks run in reverse order during runtime destruction. */
  private readonly disposers: Array<() => void> = [];

  /** Current revision of the framework-neutral editor. */
  get revision(): number {
    return this.editor.revision;
  }

  /**
   * Creates every manager, then installs host extensions.
   *
   * Manager construction precedes extension setup so an extension receives the fully
   * usable runtime instance. Any registration conflict destroys all completed
   * setup before the constructor rethrows.
   *
   * Writing-block registration is not done here — hosts install
   * `defaultWritingBlockExtension` (included by `standardPreset`).
   */
  constructor(options: CreateEditorRuntimeOptions) {
    const editor = options.editor;
    this.editor = editor;
    this.elements = editor.elements;
    this.mode = editor.mode;
    this.commands = editor.commands;
    this.history = editor.history;
    const extensions = new ExtensionManager(this);
    this.extensions = extensions;
    this.disposers.push(() => extensions.destroy());
    this.editorViews = new EditorViewRegistry(this);
    const events = new EventManager(this);
    this.events = events;
    this.disposers.push(() => this.editorViews.cancelPendingSelections());
    this.selection = editor.selection;
    const keyboard = new KeyboardManager(this, options.keymap);
    this.keyboard = keyboard;
    const slashCommands = new SlashCommandRegistry(extensions);
    this.slashCommands = slashCommands;
    // Release shared registrations after extension cleanup has finished using them.
    this.extensions.own(() => {
      slashCommands.destroy();
      keyboard.destroy();
      events.destroy();
      this.editorViews.destroy();
    });
    this.renderers = new RendererManager(extensions, options.unknownBlockRenderer);
    this.blockBehaviors = new BlockBehaviorRegistry(this);
    this.blockListProps = new BlockListPropsManager(this, editor.blockListProps);
    this.blockTypes = new BlockTypeManager(this, editor);
    this.blocks = editor.blocks;
    this.clipboard = new ClipboardManager(editor);
    this.clipboardFormats = new ClipboardFormatRegistry(extensions);
    this.pasteStrategies = editor.clipboard.pasteStrategies;
    this.surfaces = new SurfaceManager(extensions);
    this.blockElements = new BlockElementProjection(this);
    this.disposers.push(() => this.blockElements.destroy());
    try {
      this.extensions.initialize(options.extensions ?? []);
      this.disposers.push(
        this.blocks.subscribeRootIds(this.blockElements.schedule),
        this.elements.subscribe(this.blockElements.schedule),
      );
      this.blockElements.schedule();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /**
   * Installs writing factories used by keyboard, trailing, separator, and clipboard paths.
   *
   * Called by `defaultWritingBlockExtension` to configure empty writing blocks
   * for all rendered occurrences of this document.
   * @param options - Replacement factories for empty writing blocks.
   * @returns Disposer that restores the previous factories.
   */
  installDefaultWriting(options: {
    createDefaultBlock: CreateDefaultBlock;
    isEmptyBlock: IsEmptyBlock;
  }): () => void {
    const previousCreate = this.createDefaultBlock;
    const previousIsEmpty = this.isEmptyBlock;
    this.createDefaultBlock = options.createDefaultBlock;
    this.isEmptyBlock = options.isEmptyBlock;
    return () => {
      this.createDefaultBlock = previousCreate;
      this.isEmptyBlock = previousIsEmpty;
    };
  }

  /** Forwards changes from this document, its local mode, and core definitions to React subscribers.
   * Subscribes to this document, its local mode, and core definitions; selection has its own stream. */
  subscribe(listener: () => void): () => void {
    return this.editor.subscribe(listener);
  }

  /**
   * Reads the permanently bound document without selecting a rendered occurrence.
   * Every manager and subscription of this editor keeps using that source model.
   * @returns The fixed model supplied when this editor was constructed.
   */
  getDocument(): DocumentModel { return this.editor.getDocument(); }

  /**
   * Releases React managers while the lifecycle owner retains the core and document.
   *
   * Selection restoration is cancelled while its extension dependencies remain
   * available. ExtensionManager then runs extension cleanup and owned registrations.
   * Event listeners are detached through the existing manager registrations. All
   * runtime disposers run even if cleanup fails, with errors reported afterward.
   * Document/model disposal belongs to EditorStorage or the caller. Close the core
   * after this synchronous React cleanup, then await model destruction before
   * destroying the application's document registry and provider metadata.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const errors: unknown[] = [];
    for (const dispose of this.disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch (error) {
        // One failed cleanup must not prevent the remaining managers from releasing resources.
        errors.push(error);
      }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "React editor teardown failed");
  }
}

/** Creates a modular React runtime around the supplied single-document core editor. */
export const createEditorRuntime = (
  options: CreateEditorRuntimeOptions,
): EditorRuntime => new EditorRuntime(options);
