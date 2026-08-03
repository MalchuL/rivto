/**
 * React runtime coordinator.
 *
 * Concrete registration state belongs to focused managers. ReactEditor only
 * wires those managers around one core editor, installs defaults/extensions,
 * and owns final destruction ordering.
 *
 * @module
 */
import {
  defaultBlockDefinitions,
  type RivtoEditorApi as Editor,
} from "@chulane/rivto";
import { MarkdownContent } from "./blocks/markdown";
import {
  BlockManager,
  EventManager,
  ExtensionManager,
  KeyboardManager,
  ReactSelectionManager,
  ReactSlashCommandManager,
  RendererManager,
  SurfaceManager,
} from "./managers";
import type { CreateReactEditorOptions, ReactEditor } from "./types";

export type { CreateReactEditorOptions, ReactEditor } from "./types";

/** Internal implementation; applications receive the capability-only interface. */
export class ReactEditorImpl implements ReactEditor {
  /** Framework-neutral document, command, mode, and history runtime. */
  readonly editor: Editor;
  /** Content renderers indexed by persisted block type. */
  readonly renderers: RendererManager;
  /** Atomic definition, renderer, and type-conversion registration. */
  readonly blocks: BlockManager;
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
  /** React-owned access to the shared core slash-command registry. */
  readonly slashCommands: ReactSlashCommandManager;

  private destroyed = false;

  /** Current revision of the framework-neutral editor. */
  get revision(): number {
    return this.editor.revision;
  }

  /**
   * Creates every manager, registers Markdown, then installs host extensions.
   *
   * Manager construction precedes extension setup so an extension receives the fully
   * usable runtime instance. Any registration conflict destroys all completed
   * setup before the constructor rethrows.
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
    this.surfaces = new SurfaceManager(this);
    try {
      this.blocks.register({
        definition: defaultBlockDefinitions[0]!,
        render: options.onMarkdownLinkClick
          ? (props) => <MarkdownContent {...props} onLinkClick={options.onMarkdownLinkClick} />
          : MarkdownContent,
        slashCommand: {
          title: "Markdown",
          group: "Turn into",
          keywords: ["paragraph", "text"],
        },
      });
      this.extensions.initialize(options.extensions ?? []);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /** Forwards the core editor's global revision stream. */
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
    this.extensions.destroy();
    this.keyboard.destroy();
    this.events.destroy();
  }
}

/** Creates a modular React runtime around an existing core editor. */
export const createReactEditor = (
  options: CreateReactEditorOptions,
): ReactEditor => new ReactEditorImpl(options);
