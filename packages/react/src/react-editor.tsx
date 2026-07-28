/**
 * React runtime coordinator.
 *
 * Concrete registration state belongs to focused managers. ReactEditor only
 * wires those managers around one core editor, forwards core revisions to
 * React, installs defaults/plugins, and owns final destruction ordering.
 *
 * @module
 */
import {
  defaultBlockDefinitions,
  type RivtoEditorApi,
} from "@chulane/rivto";
import { MarkdownContent } from "./blocks/markdown";
import {
  BlockManager,
  EventManager,
  PluginManager,
  ReactSelectionManager,
  ReactSlashCommandManager,
  RendererManager,
  SurfaceManager,
  type BlockRenderer,
  type KeymapOverrides,
  type ReactEditorPlugin,
} from "./managers";

/** Creation options for the React presentation runtime. */
export interface CreateReactEditorOptions {
  /** Existing framework-neutral editor; ReactEditor never destroys it. */
  readonly editor: RivtoEditorApi;
  /** Functional plugins installed synchronously in declaration order. */
  readonly plugins?: readonly ReactEditorPlugin[];
  /** Stable binding-ID overrides; empty arrays disable matching bindings. */
  readonly keymap?: KeymapOverrides;
  /** Renderer used for persisted block types unknown to this React runtime. */
  readonly unknownBlockRenderer?: BlockRenderer;
}

/**
 * Coordinates React presentation managers around one core editor.
 *
 * Managers are public extension boundaries. Plugins register directly through
 * `blocks`, `renderers`, `surfaces`, `plugins`, `events`, `selection`, and
 * `slashCommands`; ReactEditor deliberately exposes no forwarding registry
 * methods or mutable collections.
 */
export class ReactEditor {
  /** Framework-neutral document, command, mode, and history runtime. */
  readonly editor: RivtoEditorApi;
  /** Content renderers indexed by persisted block type. */
  readonly renderers: RendererManager;
  /** Atomic definition, renderer, and type-conversion registration. */
  readonly blocks: BlockManager;
  /** Root surfaces and their ordered block/editor wrappers. */
  readonly surfaces: SurfaceManager;
  /** Plugin setup, mounted UI, registration ownership, and cleanup. */
  readonly plugins: PluginManager;
  /** Composed surface/document/window DOM and keyboard event runtime. */
  readonly events: EventManager;
  /** Current-surface DOM selection conversion and highlighting. */
  readonly selection: ReactSelectionManager;
  /** React-owned access to the shared core slash-command registry. */
  readonly slashCommands: ReactSlashCommandManager;

  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeEditor: () => void;
  private currentRevision = 0;
  private destroyed = false;

  /**
   * Creates every manager, registers Markdown, then installs host plugins.
   *
   * Manager construction precedes plugin setup so a plugin receives the fully
   * usable runtime instance. Any registration conflict destroys all completed
   * setup before the constructor rethrows.
   */
  constructor(options: CreateReactEditorOptions) {
    this.editor = options.editor;
    // Constructors retain this owner but must not resolve sibling managers
    // until an operation runs. This keeps the dependency graph cyclic in
    // capability while initialization itself remains strictly ordered.
    this.plugins = new PluginManager(this);
    this.events = new EventManager(this, options.keymap);
    this.selection = new ReactSelectionManager(this);
    this.slashCommands = new ReactSlashCommandManager(this);
    this.renderers = new RendererManager(this, options.unknownBlockRenderer);
    this.blocks = new BlockManager(this);
    this.surfaces = new SurfaceManager(this);
    this.unsubscribeEditor = this.editor.subscribe(() => this.invalidate());

    try {
      this.blocks.register({
        definition: defaultBlockDefinitions[0]!,
        render: MarkdownContent,
        slashCommand: {
          title: "Markdown",
          group: "Turn into",
          keywords: ["paragraph", "text"],
        },
      });
      this.plugins.initialize(options.plugins ?? []);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /** Current monotonic React invalidation revision. */
  get revision(): number {
    return this.currentRevision;
  }

  /**
   * Subscribes to presentation-manager and forwarded core changes.
   *
   * @param listener - Callback consumed by React's external-store integration.
   * @returns Disposer removing only this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Releases React managers without destroying the core editor.
   *
   * PluginManager first runs plugin cleanup and owned registrations. Event
   * listeners are then detached before the forwarded core subscription and
   * React listeners are released.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.plugins.destroy();
    this.events.destroy();
    this.unsubscribeEditor();
    this.listeners.clear();
  }

  /**
   * Publishes a stable listener snapshot after observable manager changes.
   *
   * @internal Manager-only invalidation hook. Application plugins should mutate
   * state through a public manager or core command instead of calling it.
   */
  invalidate(): void {
    this.currentRevision += 1;
    [...this.listeners].forEach((listener) => listener());
  }
}

/** Creates a modular React runtime around an existing core editor. */
export const createReactEditor = (
  options: CreateReactEditorOptions,
): ReactEditor => new ReactEditor(options);
