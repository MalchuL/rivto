import { ElementTypeManager } from "../managers/elements/element-type-manager";
import type { ExtensionsApi } from "../managers/extensions/api";
import { PanelElements } from "@chulane/rivto";
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
import type {
  DocumentEditorAPI,
} from "@chulane/rivto";
import { BlockElementProjection } from "../elements/block-element-projection";
import type { CreateDefaultBlock, IsEmptyBlock } from "../extensions/built-ins/page/default-writing-block/types";
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
  get blocks(): DocumentEditorAPI["blocks"] { return this.core.blocks; }
  /** @inheritdoc DocumentEditorAPI.elements */
  get elements(): DocumentEditorAPI["elements"] { return this.core.elements; }
  /** @inheritdoc DocumentEditorAPI.commands */
  get commands(): DocumentEditorAPI["commands"] { return this.core.commands; }
  /** @inheritdoc DocumentEditorAPI.selection */
  get selection(): DocumentEditorAPI["selection"] { return this.core.selection; }
  /** @inheritdoc DocumentEditorAPI.history */
  get history(): DocumentEditorAPI["history"] { return this.core.history; }
  /** @inheritdoc DocumentEditorAPI.blockRegistry */
  get blockRegistry(): DocumentEditorAPI["blockRegistry"] { return this.core.blockRegistry; }
  /** @inheritdoc DocumentEditorAPI.elementRegistry */
  get elementRegistry(): DocumentEditorAPI["elementRegistry"] { return this.core.elementRegistry; }
  /** @inheritdoc DocumentEditorAPI.revision */
  get revision(): number { return this.core.revision; }
  /** @inheritdoc DocumentEditorAPI.subscribe */
  readonly subscribe = (listener: () => void): (() => void) => this.core.subscribe(listener);
  /** @inheritdoc DocumentEditorAPI.getDocument */
  getDocument(): ReturnType<DocumentEditorAPI["getDocument"]> { return this.core.getDocument(); }
  /** @inheritdoc DocumentEditorAPI.load */
  load(snapshot: Parameters<DocumentEditorAPI["load"]>[0]): void { this.core.load(snapshot); }
  /** @inheritdoc DocumentEditorAPI.dump */
  dump(): ReturnType<DocumentEditorAPI["dump"]> { return this.core.dump(); }

  private readonly panelProjections = new Map<string, { consumers: number; release: () => void }>();
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
  /** Atomic React block-type and presentation registration. */
  readonly blockTypes: BlockTypesApi;
  /** Atomic element definitions and React presentation registrations. */
  readonly elementTypes: ElementTypeManager;
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
    // Release shared registrations after extension cleanup has finished using them.
    extensions.registerCleanup(() => {
      slashCommands.destroy();
      keyboard.destroy();
      events.destroy();
      this.panels.destroy();
    });
    this.renderers = new RendererManager(extensions, options.unknownBlockRenderer);
    this.blockBehaviors = new BlockBehaviorRegistry(this, extensions);
    this.blockListProps = new BlockListPropsManager(extensions, editor.blockListProps);
    this.blockTypes = new BlockTypeManager(this, editor, extensions);
    this.clipboard = new ClipboardManager(editor, this, extensions);
    this.elementTypes = new ElementTypeManager(this, extensions);
    this.clipboardFormats = new ClipboardFormatRegistry(extensions, this.clipboard.converters);
    this.pasteStrategies = editor.clipboard.pasteStrategies;
    this.surfaces = new SurfaceManager(extensions);
    this.blockElements = new BlockElementProjection(this);
    this.disposers.push(() => this.blockElements.destroy());
    this.disposers.push(() => { this.panelProjections.forEach((entry) => entry.release()); this.panelProjections.clear(); });
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
   * Keeps a block-card projection active while views display the same pair of roots.
   * No container is created for null: those views share document element roots.
   * Missing roots leave their stored data intact so undo can restore the view.
   * Projection subscriptions are shared by all consumers of the pair and released
   * when the last view disconnects; the null/null projection follows runtime lifetime.
   * @param rootBlockId - Block whose direct children are displayed, or null for document roots.
   * @param rootElementId - Element container whose descendants are displayed, or null for all elements.
   * @returns Idempotent release function for this consumer.
   */
  acquirePanel(rootBlockId: string | null, rootElementId: string | null): () => void {
    if (rootBlockId === null && rootElementId === null) {
      return () => undefined;
    }
    const key = JSON.stringify([rootBlockId, rootElementId]);
    let entry = this.panelProjections.get(key);
    if (!entry) {
      const projection = this.blockElements.createPanelProjection(rootBlockId, rootElementId);
      const unsubscribeBlocks = this.core.blocks.subscribeStructure(projection.schedule);
      const unsubscribeElements = new PanelElements(this.core.elements, this.core.getDocument(), rootElementId).subscribe(projection.schedule);
      entry = { consumers: 0, release: () => { unsubscribeBlocks(); unsubscribeElements(); projection.destroy(); } };
      this.panelProjections.set(key, entry);
      projection.reconcile();
    }
    entry.consumers++;
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      if (--entry.consumers === 0) { entry.release(); this.panelProjections.delete(key); }
    };
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
    if (this.destroyed) return Promise.resolve();
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
export const createReactEditor = (
  options: CreateReactEditorOptions,
): ReactEditor => new ReactEditor(options);
