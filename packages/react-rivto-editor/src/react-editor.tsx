/**
 * React runtime coordinator.
 *
 * Concrete registration state belongs to focused managers. ReactEditor only
 * wires those managers around one core editor, installs extensions, and owns
 * final destruction ordering.
 *
 * @module
 */
import type { RivtoEditorApi as Editor } from "@chulane/rivto";
import {
  BlockManager,
  ClipboardManager,
  EventManager,
  ExtensionManager,
  KeyboardManager,
  ReactSelectionManager,
  ReactSlashCommandManager,
  RendererManager,
  SurfaceManager,
} from "./managers";
import type { CreateReactEditorOptions, ReactEditor } from "./types";
import { reconcileBlockElements } from "./surfaces/edgeless/block-elements";
import type { CreateDefaultBlock, IsEmptyBlock } from "./extensions/page/empty-block";

export type { CreateReactEditorOptions, ReactEditor } from "./types";

const WRITING_NOT_INSTALLED =
  "Install defaultWritingBlockExtension (or call installDefaultWriting) before using writing factories";

/** Internal implementation; applications receive the capability-only interface. */
export class ReactEditorImpl implements ReactEditor {
  /** Framework-neutral document, command, mode, and history runtime. */
  readonly editor: Editor;
  /** Factory for empty writing blocks; set by {@link installDefaultWriting}. */
  createDefaultBlock: CreateDefaultBlock = () => {
    throw new Error(WRITING_NOT_INSTALLED);
  };
  /** Empty-block predicate; set by {@link installDefaultWriting}. */
  isEmptyBlock: IsEmptyBlock = () => {
    throw new Error(WRITING_NOT_INSTALLED);
  };
  /** Content renderers indexed by persisted block type. */
  readonly renderers: RendererManager;
  /** Atomic definition, renderer, and type-conversion registration. */
  readonly blocks: BlockManager;
  /** React-owned portable clipboard formatter and parser registry. */
  readonly clipboard: ClipboardManager;
  /** Root surfaces and their ordered block/editor wrappers. */
  readonly surfaces: SurfaceManager;
  /** Extension setup, mounted UI, registration ownership, and cleanup. */
  readonly extensions: ExtensionManager;
  /** Delegated surface/document/window DOM event runtime. */
  readonly events: EventManager;
  /** Semantic keyboard bindings and runtime keymap overrides. */
  readonly keyboard: KeyboardManager;
  /** Current-surface DOM selection conversion and highlighting. */
  readonly selection: ReactSelectionManager;
  /** React-owned slash-command registry. */
  readonly slashCommands: ReactSlashCommandManager;
  private destroyed = false;
  private reconciliationQueued = false;
  private unsubscribeReconciliation?: () => void;

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
    this.editor = options.editor;
    // Constructors retain this owner but must not resolve sibling managers
    // until an operation runs. This keeps the dependency graph cyclic in
    // capability while initialization itself remains strictly ordered.
    this.extensions = new ExtensionManager(this);
    this.events = new EventManager(this);
    this.keyboard = new KeyboardManager(this, options.keymap);
    this.selection = new ReactSelectionManager(this);
    this.slashCommands = new ReactSlashCommandManager(this);
    this.renderers = new RendererManager(this, options.unknownBlockRenderer);
    this.blocks = new BlockManager(this);
    this.clipboard = new ClipboardManager(this);
    this.surfaces = new SurfaceManager(this);
    try {
      this.extensions.initialize(options.extensions ?? []);
      this.unsubscribeReconciliation = this.editor.subscribe(() => this.queueBlockElementReconciliation());
      this.queueBlockElementReconciliation();
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
   * Releases React managers without destroying the core editor.
   *
   * ExtensionManager first runs extension cleanup and owned registrations. Event
   * listeners are then detached.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.unsubscribeReconciliation?.();
    this.unsubscribeReconciliation = undefined;
    this.extensions.destroy();
    this.slashCommands.destroy();
    this.keyboard.destroy();
    this.events.destroy();
  }
}

/** Creates a modular React runtime around an existing core editor. */
export const createReactEditor = (
  options: CreateReactEditorOptions,
): ReactEditor => new ReactEditorImpl(options);
