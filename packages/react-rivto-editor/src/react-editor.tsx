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
  BlockListPropsManagerApi,
  CommandRegistryApi,
  ElementManagerApi,
  HistoryManagerApi,
  ModeManagerApi,
  RivtoEditorApi,
} from "@chulane/rivto";
import type { DocumentModel } from "@chulane/document-model";
import {
  BlockManager,
  BlockTypeManager,
  ClipboardManager,
  EventManager,
  ExtensionManager,
  KeyboardManager,
  ReactSelectionManager,
  ReactSlashCommandManager,
  RendererManager,
  SurfaceManager,
  ViewManager,
  type ReactEditorExtension,
  type RegistrationDisposer,
} from "./managers";
import type { CreateReactEditorOptions, ReactEditor } from "./types";
import type {
  BlockListPropsCapability,
  BlocksCapability,
  BlockTypesCapability,
  ClipboardCapability,
  EventsCapability,
  ExtensionsCapability,
  KeyboardCapability,
  RenderersCapability,
  SelectionCapability,
  SlashCommandsCapability,
  SurfacesCapability,
  ViewsCapability,
} from "./capabilities";
import { reconcileBlockElements } from "./elements/block-element-projection";
import type { CreateDefaultBlock, IsEmptyBlock } from "./extensions/built-ins/page/default-writing-block";

export type { CreateReactEditorOptions, ReactEditor } from "./types";

const WRITING_NOT_INSTALLED =
  "Install defaultWritingBlockExtension (or call installDefaultWriting) before using writing factories";

/** Internal extension lifecycle required by collaborating managers. */
interface RuntimeExtensionsCapability extends ExtensionsCapability {
  initialize(extensions: readonly ReactEditorExtension[]): void;
  own(release: RegistrationDisposer): RegistrationDisposer;
  assertActive(): void;
  destroy(): void;
}

/** Internal implementation; applications receive the capability-only interface. */
export class ReactEditorImpl implements ReactEditor {
  /** Framework-neutral document, command, mode, and history runtime. */
  private readonly editor: RivtoEditorApi;
  /** Focused core element manager exposed without its coordinator. */
  readonly elements: ElementManagerApi;
  /** Focused core mode manager exposed without its coordinator. */
  readonly mode: ModeManagerApi;
  /** Focused core command manager exposed without its coordinator. */
  readonly commands: CommandRegistryApi;
  /** Focused core history manager exposed without its coordinator. */
  readonly history: HistoryManagerApi;
  /** Factory for empty writing blocks; set by {@link installDefaultWriting}. */
  createDefaultBlock: CreateDefaultBlock = () => {
    throw new Error(WRITING_NOT_INSTALLED);
  };
  /** Empty-block predicate; set by {@link installDefaultWriting}. */
  isEmptyBlock: IsEmptyBlock = () => {
    throw new Error(WRITING_NOT_INSTALLED);
  };
  /** Content renderers indexed by persisted block type. */
  readonly renderers: RenderersCapability;
  /** Per-type outline and drop behavior resolved by page dispatchers. */
  readonly views: ViewsCapability;
  /** Guarded mutations and delegated core block operations. */
  readonly blocks: BlocksCapability;
  /** Atomic React block-type and presentation registration. */
  readonly blockTypes: BlockTypesCapability;
  /** Core list-property policy with React extension lifecycle ownership. */
  readonly blockListProps: BlockListPropsCapability;
  /** React-owned portable clipboard formatter and parser registry. */
  readonly clipboard: ClipboardCapability;
  /** Root surfaces and their ordered block/editor wrappers. */
  readonly surfaces: SurfacesCapability;
  /** Extension setup, mounted UI, registration ownership, and cleanup. */
  readonly extensions: RuntimeExtensionsCapability;
  /** Delegated surface/document/window DOM event runtime. */
  readonly events: EventsCapability;
  /** Semantic keyboard bindings and runtime keymap overrides. */
  readonly keyboard: KeyboardCapability;
  /** Current-surface DOM selection conversion and highlighting. */
  readonly selection: SelectionCapability;
  /** React-owned slash-command registry. */
  readonly slashCommands: SlashCommandsCapability;
  private destroyed = false;
  private reconciliationQueued = false;
  private readonly reconciliationDisposers: Array<() => void> = [];

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
  constructor(options: CreateReactEditorOptions) {
    const editor = options.editor;
    this.editor = editor;
    this.elements = editor.elements;
    this.mode = editor.mode;
    this.commands = editor.commands;
    this.history = editor.history;
    this.extensions = new ExtensionManager(this);
    const events = new EventManager(this);
    this.events = events;
    this.selection = new ReactSelectionManager(this, editor);
    const keyboard = new KeyboardManager(this, options.keymap);
    this.keyboard = keyboard;
    const slashCommands = new ReactSlashCommandManager(this);
    this.slashCommands = slashCommands;
    // Keep teardown private while the public fields expose capability-only contracts.
    this.extensions.own(() => {
      slashCommands.destroy();
      keyboard.destroy();
      events.destroy();
    });
    this.renderers = new RendererManager(this, options.unknownBlockRenderer);
    this.views = new ViewManager(this);
    this.blockListProps = {
      register: (registration) => {
        this.extensions.assertActive();
        return this.extensions.own(editor.blockListProps.register(registration));
      },
      has: (id) => editor.blockListProps.has(id),
      validate: (candidate) => editor.blockListProps.validate(candidate),
      prepare: (candidate) => editor.blockListProps.prepare(candidate),
    } satisfies Omit<BlockListPropsManagerApi, "destroy">;
    this.blockTypes = new BlockTypeManager(this, editor);
    this.blocks = new BlockManager(editor);
    this.clipboard = new ClipboardManager(this, editor);
    this.surfaces = new SurfaceManager(this);
    try {
      this.extensions.initialize(options.extensions ?? []);
      this.reconciliationDisposers.push(
        this.blocks.subscribeRootIds(() => this.queueBlockElementReconciliation()),
        this.elements.subscribe(() => this.queueBlockElementReconciliation()),
      );
      if (editor.getDocument()) this.queueBlockElementReconciliation();
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /**
   * Installs writing factories used by keyboard, trailing, separator, and clipboard paths.
   *
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
   * Coalesces synchronous document edits before repairing the React-owned block
   * element projection. This keeps initialization and collaborative update
   * bursts deterministic without coupling the projection to a mounted surface.
   */
  private queueBlockElementReconciliation(): void {
    if (this.reconciliationQueued || this.destroyed) return;
    this.reconciliationQueued = true;
    queueMicrotask(() => {
      this.reconciliationQueued = false;
      if (!this.destroyed) reconcileBlockElements(this);
    });
  }

  /** Forwards the core editor's document/mode/registry revision stream. */
  subscribe(listener: () => void): () => void {
    return this.editor.subscribe(listener);
  }

  /**
   * @returns The document model currently presented by the core editor, or undefined while unbound.
   */
  getDocument(): DocumentModel | undefined {
    return this.editor.getDocument();
  }

  /**
   * Replaces the active core document while retaining every React manager.
   * @param document - Caller-owned model to present.
   * @returns No value.
   */
  setDocument(document: DocumentModel): void {
    this.editor.setDocument(document);
  }

  /**
   * Releases React managers without destroying the core editor.
   *
   * ExtensionManager first runs extension cleanup and owned registrations. Event
   * listeners are then detached.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.reconciliationDisposers.splice(0).forEach((dispose) => dispose());
    this.extensions.destroy();
  }
}

/** Creates a modular React runtime around an existing core editor. */
export const createReactEditor = (
  options: CreateReactEditorOptions,
): ReactEditor => new ReactEditorImpl(options);
