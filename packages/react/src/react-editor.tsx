/**
 * Registry and lifecycle for React presentation registrations.
 *
 * This module deliberately contains no surface behavior. It coordinates core
 * block definitions, React renderers, functional plugins, and delegated events
 * while leaving document ownership with `RivtoEditorApi`.
 *
 * @module
 */
import {
  defaultBlockDefinitions,
  type BlockDefinition,
  type EditorMode,
  type RivtoEditorApi,
  type SlashCommandContext,
} from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import { MarkdownContent } from "./blocks/markdown";
import type { BlockWrapperComponent } from "./blocks/block-wrapper";
import {
  KeyboardEditorEvents,
  type KeymapOverrides,
} from "./events";

/** Props shared by every registered content renderer. */
export interface BlockRendererProps {
  /** Stable ID resolved by the renderer through block hooks. */
  readonly blockId: string;
}

/** React component responsible only for one block's content UI. */
export type BlockRenderer = ComponentType<BlockRendererProps>;
/** Root React component that renders one complete editor presentation mode. */
export type SurfaceComponent = ComponentType;
/** Headless or visual component mounted by a functional plugin. */
export type PluginComponent = ComponentType;
/** Plugin component wrapped around the complete active EditorView content. */
export type EditorWrapper = ComponentType<{ readonly children?: ReactNode }>;

/** Optional slash conversion installed with a React block registration. */
export interface ReactBlockSlashCommand {
  /** Stable command ID; defaults to `type.<block type>`. */
  readonly id?: string;
  /** User-visible command label. */
  readonly title: string;
  /** Optional menu group used by the slash popup. */
  readonly group?: string;
  /** Alternative normalized search terms. */
  readonly keywords?: readonly string[];
  /** Additional contextual condition evaluated after type eligibility. */
  readonly isAvailable?: (context: SlashCommandContext) => boolean;
}

/** Atomic model, renderer, and conversion registration for one block type. */
export interface ReactBlockRegistration {
  /** Framework-neutral definition registered with the core block registry. */
  readonly definition: BlockDefinition;
  /** React content renderer selected by both built-in surfaces. */
  readonly render: BlockRenderer;
  /** Optional in-place conversion entry added to the core slash manager. */
  readonly slashCommand?: ReactBlockSlashCommand;
}

/** One mounted plugin component and the modes where it is active. */
interface PluginComponentRegistration {
  /** Headless or visual component supplied by the plugin. */
  readonly component: PluginComponent;
  /** Modes in which EditorView mounts the component. */
  readonly mode?: EditorMode | readonly EditorMode[];
}

/** One editor-wide wrapper and the modes where it surrounds EditorView. */
interface EditorWrapperRegistration {
  /** Component wrapped around the complete active editor UI. */
  readonly wrapper: EditorWrapper;
  /** Modes in which EditorView applies the wrapper. */
  readonly mode?: EditorMode | readonly EditorMode[];
}

/** One identity-bearing block-wrapper registration. */
interface BlockWrapperRegistration {
  /** React decorator registered by a functional plugin. */
  readonly wrapper: BlockWrapperComponent;
}

/** Functional extension installed once when ReactEditor is created. */
export interface ReactEditorPlugin {
  /** Stable identity used to reject accidental duplicate installation. */
  readonly id: string;
  /**
   * Registers the plugin's behavior through the public React runtime.
   *
   * @param reactEditor - Runtime exposing the core editor, events, and safe
   * presentation registration methods. Registrations made during setup are
   * automatically owned by this plugin.
   * @returns Optional cleanup for resources registered outside ReactEditor.
   */
  setup(reactEditor: ReactEditor): void | (() => void);
}

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
 * React-only runtime layered over the framework-neutral collaborative editor.
 *
 * It owns presentation registrations and browser-event infrastructure, but not
 * document lifetime. Plugin setup is transactional: a failure destroys every
 * completed registration before the constructor rethrows.
 */
export class ReactEditor {
  /** Unified root/document/window and keyboard event runtime. */
  readonly events: KeyboardEditorEvents;
  /** Core editor supplied by the host application. */
  readonly editor: RivtoEditorApi;
  /** Optional fallback for unknown persisted block types. */
  readonly unknownBlockRenderer?: BlockRenderer;
  /** Content renderer indexed by persisted block type. */
  private readonly renderers = new Map<string, BlockRenderer>();
  /** Root surface indexed by editor presentation mode. */
  private readonly surfaces = new Map<EditorMode, SurfaceComponent>();
  /** Ordered block decorators indexed by editor presentation mode. */
  private readonly blockWrappers = new Map<EditorMode, BlockWrapperRegistration[]>();
  /** Plugin components retained in declaration order. */
  private readonly components: PluginComponentRegistration[] = [];
  /** Editor-wide wrappers retained in declaration order. */
  private readonly editorWrappers: EditorWrapperRegistration[] = [];
  /** Installed plugin IDs used for eager duplicate validation. */
  private readonly pluginIds = new Set<string>();
  /** Complete plugin cleanups executed in reverse declaration order. */
  private readonly pluginDisposers: Array<() => void> = [];
  /** Presentation registrations still owned by this runtime. */
  private readonly presentationDisposers = new Set<() => void>();
  /** Registrations captured while one plugin's synchronous setup is running. */
  private activePluginRegistrations: Array<() => void> | null = null;
  /** Dynamic block registration cleanups owned outside plugin setup. */
  private readonly blockDisposers = new Set<() => void>();
  /** React useSyncExternalStore subscribers. */
  private readonly listeners = new Set<() => void>();
  /** Subscription forwarding core revisions into this runtime. */
  private readonly unsubscribeEditor: () => void;
  /** Monotonic invalidation signal consumed by EditorView. */
  private currentRevision = 0;
  /** Prevents duplicate cleanup and registrations after destruction. */
  private destroyed = false;

  /**
   * Creates the React runtime and installs defaults followed by host plugins.
   *
   * @param options - Core editor, plugin list, keymap, and unknown renderer.
   * @throws If any default, plugin, renderer, surface, wrapper, or binding
   * registration conflicts. Completed setup is rolled back before rethrowing.
   */
  constructor(options: CreateReactEditorOptions) {
    this.editor = options.editor;
    this.unknownBlockRenderer = options.unknownBlockRenderer;
    this.events = new KeyboardEditorEvents(
      this.editor,
      () => this.editor.mode.get(),
      options.keymap,
    );
    this.unsubscribeEditor = this.editor.subscribe(() => this.changed());

    try {
      this.registerBlock({
        definition: defaultBlockDefinitions[0]!,
        render: MarkdownContent,
        slashCommand: { title: "Markdown", group: "Turn into", keywords: ["paragraph", "text"] },
      });
      for (const plugin of options.plugins ?? []) this.installPlugin(plugin);
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  /** Current monotonic React invalidation revision. */
  get revision(): number { return this.currentRevision; }

  /**
   * Subscribes to presentation or forwarded core changes.
   *
   * @param listener - Callback used by React's external-store integration.
   * @returns Disposer that removes only this callback.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Registers model, renderer, and optional conversion command as one unit.
   *
   * Existing core definitions are reused only when they are the same definition
   * object. Any later conflict rolls back the renderer and newly defined model.
   *
   * @param registration - Definition, renderer, and optional slash metadata.
   * @returns Idempotent disposer removing everything installed by this call.
   * @throws If the runtime is destroyed or any type/command ID conflicts.
   */
  registerBlock(registration: ReactBlockRegistration): () => void {
    this.assertActive();
    const { definition, render, slashCommand } = registration;
    if (this.renderers.has(definition.type)) throw new Error(`Block renderer ${definition.type} is already registered`);
    const disposers: Array<() => void> = [];
    try {
      const existing = this.editor.blocks.get(definition.type);
      if (!existing) disposers.push(this.editor.defineBlock(definition));
      else if (existing !== definition) throw new Error(`Block type ${definition.type} is already registered`);

      this.renderers.set(definition.type, render);
      disposers.push(() => this.renderers.delete(definition.type));
      if (slashCommand) {
        disposers.push(this.editor.slashCommands.register({
          ...slashCommand,
          id: slashCommand.id ?? `type.${definition.type}`,
          isAvailable: (context) => {
            const block = this.editor.getBlock(context.blockId);
            return Boolean(block && block.type !== definition.type && slashCommand.isAvailable?.(context) !== false);
          },
          execute: ({ blockId }) => this.editor.setBlockType(blockId, definition.type),
        }));
      }
    } catch (error) {
      disposers.reverse().forEach((dispose) => dispose());
      throw error;
    }

    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      disposers.reverse().forEach((remove) => remove());
      this.blockDisposers.delete(dispose);
      this.changed();
    };
    this.blockDisposers.add(dispose);
    this.changed();
    return dispose;
  }

  /**
   * Mounts plugin-owned UI beside the active surface.
   *
   * Components may be headless hook hosts, overlays, or ordinary visual UI.
   * Registrations created during plugin setup are cleaned with that plugin;
   * registrations created later remain owned by the runtime until disposed.
   *
   * @param component - Component rendered by EditorView.
   * @param mode - Optional modes in which EditorView mounts the component.
   * @returns Idempotent disposer removing this exact component registration.
   */
  mount(
    component: PluginComponent,
    mode?: EditorMode | readonly EditorMode[],
  ): () => void {
    this.assertActive();
    const registration = { component, mode };
    this.components.push(registration);
    this.changed();
    return this.trackPresentationRegistration(() => {
      const index = this.components.indexOf(registration);
      if (index < 0) return;
      this.components.splice(index, 1);
      this.changed();
    });
  }

  /**
   * Wraps the complete EditorView content in an editor-wide component.
   *
   * This is intended for React context and interaction boundaries such as
   * dnd-kit. The first registered wrapper remains outermost.
   *
   * @param wrapper - Component accepting the next wrapper as children.
   * @param mode - Optional modes in which EditorView applies the wrapper.
   * @returns Idempotent disposer removing this exact wrapper registration.
   */
  wrapEditor(
    wrapper: EditorWrapper,
    mode?: EditorMode | readonly EditorMode[],
  ): () => void {
    this.assertActive();
    const registration = { wrapper, mode };
    this.editorWrappers.push(registration);
    this.changed();
    return this.trackPresentationRegistration(() => {
      const index = this.editorWrappers.indexOf(registration);
      if (index < 0) return;
      this.editorWrappers.splice(index, 1);
      this.changed();
    });
  }

  /**
   * Registers the single root surface for one editor mode.
   *
   * @param mode - Presentation mode owned by the surface.
   * @param surface - Root component rendered by EditorView in that mode.
   * @returns Idempotent disposer removing this exact surface registration.
   * @throws If the runtime is destroyed or the mode already has a surface.
   */
  registerSurface(mode: EditorMode, surface: SurfaceComponent): () => void {
    this.assertActive();
    if (this.surfaces.has(mode)) throw new Error(`Surface ${mode} is already registered`);
    this.surfaces.set(mode, surface);
    this.changed();
    return this.trackPresentationRegistration(() => {
      if (this.surfaces.get(mode) !== surface) return;
      this.surfaces.delete(mode);
      this.changed();
    });
  }

  /**
   * Appends a decorator to one mode's ordered block-wrapper chain.
   *
   * The registration object, rather than component identity, is used for
   * disposal so the same wrapper may intentionally appear more than once.
   *
   * @param mode - Mode whose rendered blocks receive the wrapper.
   * @param wrapper - Component receiving the next wrapper as children.
   * @returns Idempotent disposer removing this exact wrapper registration.
   */
  registerBlockWrapper(
    mode: EditorMode,
    wrapper: BlockWrapperComponent,
  ): () => void {
    this.assertActive();
    const wrappers = this.blockWrappers.get(mode) ?? [];
    const registration = { wrapper };
    wrappers.push(registration);
    this.blockWrappers.set(mode, wrappers);
    this.changed();
    return this.trackPresentationRegistration(() => {
      const current = this.blockWrappers.get(mode);
      if (!current) return;
      const index = current.indexOf(registration);
      if (index < 0) return;
      current.splice(index, 1);
      if (current.length) {
        this.blockWrappers.set(mode, current);
      } else {
        this.blockWrappers.delete(mode);
      }
      this.changed();
    });
  }

  /**
   * Resolves a content renderer by persisted block type.
   *
   * @param type - Block type stored in the document.
   * @returns Registered renderer, configured unknown renderer, or undefined.
   */
  getRenderer(type: string): BlockRenderer | undefined {
    return this.renderers.get(type) ?? this.unknownBlockRenderer;
  }

  /**
   * Resolves the root surface registered for an editor mode.
   *
   * @param mode - Current or prospective presentation mode.
   * @returns Registered surface, or undefined when configuration is incomplete.
   */
  getSurface(mode: EditorMode): SurfaceComponent | undefined {
    return this.surfaces.get(mode);
  }

  /**
   * Reads block decorators registered for a presentation mode.
   *
   * Surfaces call this indirectly through `BlockWrapper`; application code
   * normally registers wrappers through the public runtime during plugin setup.
   *
   * @param mode - Active or prospective editor presentation mode.
   * @returns A defensive copy in registration order. The first component is
   * rendered outermost.
   */
  getBlockWrappers(mode: EditorMode): readonly BlockWrapperComponent[] {
    return (this.blockWrappers.get(mode) ?? []).map(({ wrapper }) => wrapper);
  }

  /**
   * Returns plugin components active in one mode, preserving declaration order.
   *
   * @param mode - Mode used to filter optional restrictions.
   * @returns New array safe for EditorView to map during rendering.
   */
  getComponents(mode: EditorMode): PluginComponent[] {
    return this.components
      .filter((registration) => matchesMode(registration.mode, mode))
      .map((registration) => registration.component);
  }

  /**
   * Returns editor-wide wrappers active in one mode.
   *
   * @param mode - Mode used to filter optional restrictions.
   * @returns New array composed from outermost to innermost by EditorView.
   */
  getEditorWrappers(mode: EditorMode): EditorWrapper[] {
    return this.editorWrappers
      .filter((registration) => matchesMode(registration.mode, mode))
      .map((registration) => registration.wrapper);
  }

  /**
   * Connects delegated events to the currently committed surface root.
   *
   * @param root - Active root element, or null while a surface is unmounted.
   */
  setRoot(root: HTMLElement | null): void {
    this.events.setRoot(root);
  }

  /**
   * Releases React registrations without destroying the core editor.
   *
   * Plugin cleanup and its owned presentation registrations run in reverse
   * declaration order. Remaining dynamic presentation registrations, blocks,
   * event listeners, and the forwarded core subscription follow.
   */
  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pluginDisposers.reverse().forEach((dispose) => dispose());
    [...this.presentationDisposers].reverse().forEach((dispose) => dispose());
    [...this.blockDisposers].reverse().forEach((dispose) => dispose());
    this.events.destroy();
    this.unsubscribeEditor();
    this.listeners.clear();
  }

  /**
   * Installs one plugin with owned-disposer tracking and rollback.
   *
   * @param plugin - Stable functional extension to install.
   * @throws If its ID conflicts or setup throws. Registrations created during
   * the failed setup are removed in reverse order.
   */
  private installPlugin(plugin: ReactEditorPlugin): void {
    if (!plugin.id.trim()) throw new Error("React plugin ID is required");
    if (this.pluginIds.has(plugin.id)) throw new Error(`React plugin ${plugin.id} is already registered`);
    const owned: Array<() => void> = [];
    this.pluginIds.add(plugin.id);
    this.activePluginRegistrations = owned;
    try {
      const cleanup = plugin.setup(this);
      this.pluginDisposers.push(() => {
        cleanup?.();
        owned.reverse().forEach((dispose) => dispose());
        this.pluginIds.delete(plugin.id);
      });
    } catch (error) {
      owned.reverse().forEach((dispose) => dispose());
      this.pluginIds.delete(plugin.id);
      throw error;
    } finally {
      this.activePluginRegistrations = null;
    }
  }

  /**
   * Gives one public presentation registration runtime and plugin ownership.
   *
   * The wrapper makes disposal truly idempotent, removes dynamic registrations
   * during `destroy()`, and lets `installPlugin` roll back partial synchronous
   * setup without recreating a separate plugin context.
   *
   * @param disposeRegistration - Removes the registration from its private store.
   * @returns Public disposer tracked by the runtime and active plugin, if any.
   */
  private trackPresentationRegistration(
    disposeRegistration: () => void,
  ): () => void {
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      disposeRegistration();
      this.presentationDisposers.delete(dispose);
    };
    this.presentationDisposers.add(dispose);
    this.activePluginRegistrations?.push(dispose);
    return dispose;
  }

  /** Increments the external-store revision and notifies a stable listener copy. */
  private changed(): void {
    this.currentRevision += 1;
    [...this.listeners].forEach((listener) => listener());
  }

  /** @throws When a mutating registration is attempted after destroy(). */
  private assertActive(): void {
    if (this.destroyed) throw new Error("React editor is destroyed");
  }
}

/**
 * Creates a React presentation runtime around an existing core editor.
 *
 * @param options - Core editor and creation-time React configuration.
 * @returns Fully installed ReactEditor ready for EditorView.
 */
export const createReactEditor = (options: CreateReactEditorOptions): ReactEditor => new ReactEditor(options);

/**
 * Tests whether a registration without, with one, or with several mode filters
 * is active for a requested mode.
 *
 * @param modes - Optional registration restriction.
 * @param mode - Mode currently rendered by EditorView.
 * @returns True when the registration should participate.
 */
const matchesMode = (modes: EditorMode | readonly EditorMode[] | undefined, mode: EditorMode): boolean => (
  !modes || (Array.isArray(modes) ? modes.includes(mode) : modes === mode)
);
