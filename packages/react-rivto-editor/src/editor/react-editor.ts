import { BlockContextMenuRegistry } from "../managers/block-context-menu/registry";
import { EdgelessToolbarManager } from "../managers/edgeless-toolbar/edgeless-toolbar-manager";
import { ElementTypeManager } from "../managers/elements/element-type-manager";
import type { ExtensionsApi } from "../managers/extensions/api";
import { BlockListPropsManager } from "../managers/blocks/block-list-props-manager";
import { PanelRegistry } from "../managers/events/panel-registry";
import type { ReactEditorApi } from "./types";
/**
 * React runtime coordinator.
 *
 * Concrete registration state belongs to focused managers. ReactEditor only
 * wires those managers around one core editor, installs extensions, and owns
 * final destruction ordering.
 *
 * @module
 */
import type { DocumentEditorAPI } from "@chulane/rivto";
import { BlockElementProjection } from "../elements/block-element-projection";
import type { BlockFactory } from "../block-factories";
import type { BlockBehaviorsApi } from "../managers/blocks/block-behaviors-api";
import type { BlockListPropsApi } from "../managers/blocks/block-list-props-api";
import type { BlockTypesApi } from "../managers/blocks/block-types-api";
import type { RenderersApi } from "../managers/blocks/renderers-api";
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
} from "../managers";
import type { SurfacesApi } from "../managers/surfaces/api";
import type { CreateReactEditorOptions } from "./types";

export type { CreateReactEditorOptions } from "./types";

const WRITING_NOT_INSTALLED =
  "Install defaultWritingBlockExtension (or call installDefaultWriting) before using writing factories";

/**
 * Shares one document's managers and extension registrations across its EditorPanel and EditorEmbed components.
 *
 * The supplied core editor provides blocks, elements, history, commands, and
 * portable selection. React managers add rendering, browser event handling, block
 * behaviors, clipboard formats, and slash-command definitions. Extensions receive
 * this fully constructed runtime during setup and register their contributions once.
 *
 * Each panel implementation supplies its own DOM root, selection operations, and
 * clipboard/slash execution. Access shared operations through reactPanel.editor.
 * Destroying this runtime releases React resources in dependency order; the caller
 * or EditorStorage still owns destruction of the core editor and document model.
 *
 * React components must obtain this runtime through useReactEditor rather than
 * construct it manually, including in render, useMemo, or a useState initializer.
 * The hook owns creation after commit and matching destruction. Low-level
 * construction is reserved for managed storage infrastructure and internal tests.
 */
export class ReactEditor implements ReactEditorApi {
  /** Framework-neutral core permanently bound to this document and its managers.
   * Document managers provide the following shared capabilities:
   * Creates and updates document elements, including canvas objects, through the core element manager.
   * The underlying core editor stays internal; every view uses these same managers.
   * Named core commands registered and invoked by extensions.
   * The manager is shared by all views without exposing the underlying core editor.
   * Core undo/redo history and synchronous transaction batching for this editor.
   * All views of the document share this local history; other editors keep their own.
   * Guarded mutations and delegated core block operations.
   * Model selection shared by occurrences; DOM adapters belong to each ReactPanelApi.
   */
  private readonly core: DocumentEditorAPI;
  /** @inheritdoc DocumentEditorAPI.blocks */
  get blocks(): DocumentEditorAPI["blocks"] {
    return this.core.blocks;
  }
  /** @inheritdoc DocumentEditorAPI.elements */
  get elements(): DocumentEditorAPI["elements"] {
    return this.core.elements;
  }
  /** @inheritdoc DocumentEditorAPI.commands */
  get commands(): DocumentEditorAPI["commands"] {
    return this.core.commands;
  }
  /** @inheritdoc DocumentEditorAPI.selection */
  get selection(): DocumentEditorAPI["selection"] {
    return this.core.selection;
  }
  /** @inheritdoc DocumentEditorAPI.history */
  get history(): DocumentEditorAPI["history"] {
    return this.core.history;
  }
  /** @inheritdoc DocumentEditorAPI.blockRegistry */
  get blockRegistry(): DocumentEditorAPI["blockRegistry"] {
    return this.core.blockRegistry;
  }
  /** @inheritdoc DocumentEditorAPI.elementRegistry */
  get elementRegistry(): DocumentEditorAPI["elementRegistry"] {
    return this.core.elementRegistry;
  }
  /** @inheritdoc DocumentEditorAPI.revision */
  get revision(): number {
    return this.core.revision;
  }
  /** @inheritdoc DocumentEditorAPI.subscribe */
  readonly subscribe = (listener: () => void): (() => void) => this.core.subscribe(listener);
  /** @inheritdoc DocumentEditorAPI.getDocument */
  getDocument(): ReturnType<DocumentEditorAPI["getDocument"]> {
    return this.core.getDocument();
  }
  /** @inheritdoc DocumentEditorAPI.load */
  load(snapshot: Parameters<DocumentEditorAPI["load"]>[0]): void {
    this.core.load(snapshot);
  }
  /** @inheritdoc DocumentEditorAPI.dump */
  dump(): ReturnType<DocumentEditorAPI["dump"]> {
    return this.core.dump();
  }

  /** Creates input for an empty writing block using the installed writing extension.
   *
   * Enter, trailing insertion, separators, and clipboard operations share this factory.
   * The host configures it through {@link installDefaultWriting}.
   *
   * The creation method throws until {@link installDefaultWriting} runs.
   *
   * Checks whether a block is an empty writing block according to the installed extension.
   *
   * Enter outdent, list reset, and related operations share this predicate.
   * The host configures it through {@link installDefaultWriting}.
   *
   * The emptiness predicate throws until {@link installDefaultWriting} runs.
   *
   * The recognition method identifies this writing role without checking emptiness.
   * It also throws until {@link installDefaultWriting} runs.
   */
  defaultWritingBlockFactory: BlockFactory = {
    /** @inheritdoc BlockFactory.createEmptyBlock */
    createEmptyBlock: () => {
      throw new Error(WRITING_NOT_INSTALLED);
    },
    /** @inheritdoc BlockFactory.isBlock */
    isBlock: () => {
      throw new Error(WRITING_NOT_INSTALLED);
    },
    /** @inheritdoc BlockFactory.isEmptyBlock */
    isEmptyBlock: () => {
      throw new Error(WRITING_NOT_INSTALLED);
    },
  };
  /** Content renderers indexed by persisted block type. */
  readonly renderers: RenderersApi;
  /** Operation-aware outline and drop behaviors selected from current block data. */
  readonly blockBehaviors: BlockBehaviorsApi;
  /** Atomic React block-type and presentation registration. */
  readonly blockTypes: BlockTypesApi;
  /** Atomic element definitions and React presentation registrations. */
  readonly elementTypes: ElementTypeManager;
  /** Shared creation-tool groups and extension contributions. */
  readonly edgelessToolbar: EdgelessToolbarManager;
  /** Registers list-property validation and keyboard behavior with the core policy manager.
   * Registrations are removed when their React extension is disposed. */
  readonly blockListProps: BlockListPropsApi;
  /** React-owned portable clipboard formatter and parser registry. */
  readonly clipboardFormats: ClipboardFormatRegistry;
  /** Structured document operations; view-dependent paste receives its destination explicitly. */
  readonly clipboard: ClipboardManager;
  /** Core paste strategies extended by React clipboard integrations. */
  readonly pasteStrategies: DocumentEditorAPI["clipboard"]["pasteStrategies"];
  /** Root surfaces and their ordered block/editor wrappers. */
  readonly surfaces: SurfacesApi;
  /** Extension setup, mounted UI, registration ownership, and cleanup. */
  readonly extensions: ExtensionsApi;
  /** Delegated surface/document/window DOM event runtime. */
  readonly events: EventManager;
  /** Mounted occurrences and explicit active/default view lookup. */
  readonly panels: PanelRegistry;
  /** Semantic keyboard bindings and runtime keymap overrides. */
  readonly keyboard: KeyboardManager;
  /** Dedicated extension-owned block menu contributions. */
  readonly blockContextMenu: BlockContextMenuRegistry;
  /** React-owned slash-command registry. */
  readonly slashCommands: SlashCommandRegistry;
  private destroyed = false;
  /** Maintains the document's block elements and their default canvas geometry.
   * Mounted surfaces share this projection instead of rebuilding it independently. */
  readonly blockElements: BlockElementProjection;
  /** Cleanup callbacks run in reverse order during runtime destruction. */
  private readonly disposers: Array<() => void> = [];

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
  constructor(options: CreateReactEditorOptions) {
    const editor = options.editor;
    this.core = editor;
    const extensions = new ExtensionManager(this);
    this.extensions = extensions;
    this.disposers.push(() => extensions.destroy());
    this.panels = new PanelRegistry(this, extensions);
    const events = new EventManager(this, extensions);
    this.events = events;
    this.disposers.push(() => this.panels.cancelPendingSelections());
    const keyboard = new KeyboardManager(this, extensions, options.keymap);
    this.keyboard = keyboard;
    const slashCommands = new SlashCommandRegistry(extensions);
    this.slashCommands = slashCommands;
    this.blockContextMenu = new BlockContextMenuRegistry(extensions);
    // Release shared registrations after extension cleanup has finished using them.
    extensions.registerCleanup(() => {
      slashCommands.destroy();
      this.blockContextMenu.destroy();
      keyboard.destroy();
      events.destroy();
      this.panels.destroy();
    });
    this.renderers = new RendererManager(extensions, options.unknownBlockRenderer);
    this.blockBehaviors = new BlockBehaviorRegistry(this, extensions);
    this.blockListProps = new BlockListPropsManager(extensions, editor.blockListProps);
    this.blockTypes = new BlockTypeManager(this, editor, extensions);
    this.clipboard = new ClipboardManager(editor, this, extensions);
    this.edgelessToolbar = new EdgelessToolbarManager(extensions);
    this.elementTypes = new ElementTypeManager(this, extensions);
    this.clipboardFormats = new ClipboardFormatRegistry(extensions, this.clipboard.converters);
    this.pasteStrategies = editor.clipboard.pasteStrategies;
    this.surfaces = new SurfaceManager(extensions);
    this.blockElements = new BlockElementProjection(this);
    this.disposers.push(() => this.blockElements.destroy());
    try {
      extensions.initialize(options.extensions ?? []);
      this.disposers.push(
        this.core.blocks.subscribeStructure(this.blockElements.schedule),
        this.core.elements.subscribe(this.blockElements.schedule),
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
   * @param defaultWritingBlockFactory - Replacement creation, recognition, and emptiness contract for empty writing blocks.
   * @returns Disposer that restores the previous factories.
   */
  installDefaultWriting(defaultWritingBlockFactory: BlockFactory): () => void {
    const previous = this.defaultWritingBlockFactory;
    this.defaultWritingBlockFactory = defaultWritingBlockFactory;
    return () => {
      this.defaultWritingBlockFactory = previous;
    };
  }

  /**
   * Adds cleanup without replacing the runtime's destroy method.
   *
   * Remaining callbacks run synchronously in reverse registration order during
   * destruction. One failure does not prevent the other callbacks from running.
   * @param release - Synchronous cleanup for a resource owned by this runtime.
   * @returns Idempotent disposer that runs cleanup immediately and removes it from the list.
   * @throws If destruction has started, or if the returned disposer's cleanup fails.
   */
  registerCleanup(release: () => void): () => void {
    if (this.destroyed) {
      throw new Error("React editor is destroyed");
    }
    let active = true;
    const dispose = () => {
      if (!active) {
        return;
      }
      active = false;
      const index = this.disposers.indexOf(dispose);
      if (index >= 0) {
        this.disposers.splice(index, 1);
      }
      release();
    };
    this.disposers.push(dispose);
    return dispose;
  }

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
   * @returns An already-resolved Promise after synchronous React cleanup; the borrowed core remains usable.
   * @throws Synchronously if cleanup fails, after all React disposers have run.
   */
  destroy(): Promise<void> {
    if (this.destroyed) {
      return Promise.resolve();
    }
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
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "React editor teardown failed");
    }
    return Promise.resolve();
  }
}

/**
 * Creates a modular React runtime around the supplied single-document core editor.
 *
 * This low-level factory serves useReactEditor, managed storage, and internal tests.
 * React components must use useReactEditor instead of creating instances manually;
 * the hook pairs creation after commit with destruction on unmount or replacement.
 * @param options - Borrowed core editor and synchronous registration settings.
 * @returns Connected runtime whose owner must destroy it before disposing its borrowed core.
 * @throws If manager or extension setup fails; completed registrations are released before rethrowing.
 */
export const createReactEditor = (options: CreateReactEditorOptions): ReactEditor =>
  new ReactEditor(options);
