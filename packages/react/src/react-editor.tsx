import {
  defaultBlockDefinitions,
  type BlockDefinition,
  type EditorMode,
  type RivtoEditorApi,
  type SlashCommandContext,
} from "@chulane/rivto";
import type { ComponentType, ReactNode } from "react";
import { MarkdownContent } from "./blocks/markdown";
import { EditorEvents, type EditorEventContext, type EditorEventOptions } from "./events";
import { KeyboardEvents, type KeyboardBindingOptions, type KeyboardShortcut } from "./keyboard-events";

export interface BlockRendererProps {
  readonly blockId: string;
}

export type BlockRenderer = ComponentType<BlockRendererProps>;
export type SurfaceComponent = ComponentType;
export type PluginComponent = ComponentType;
export type SurfaceProvider = ComponentType<{ readonly children?: ReactNode }>;

export interface ReactBlockSlashCommand {
  readonly id?: string;
  readonly title: string;
  readonly group?: string;
  readonly keywords?: readonly string[];
  readonly isAvailable?: (context: SlashCommandContext) => boolean;
}

export interface ReactBlockRegistration {
  readonly definition: BlockDefinition;
  readonly render: BlockRenderer;
  readonly slashCommand?: ReactBlockSlashCommand;
}

interface ModeContribution<T> {
  readonly value: T;
  readonly mode?: EditorMode | readonly EditorMode[];
}

export interface ReactPluginContext {
  readonly editor: RivtoEditorApi;
  readonly reactEditor: ReactEditor;
  readonly events: {
    on<Type extends keyof HTMLElementEventMap>(
      type: Type,
      listener: (context: EditorEventContext<Type>) => void,
      options?: EditorEventOptions,
    ): () => void;
  };
  readonly keyboard: {
    bind(
      shortcuts: KeyboardShortcut | readonly KeyboardShortcut[],
      listener: Parameters<KeyboardEvents["bind"]>[1],
      options?: KeyboardBindingOptions,
    ): () => void;
  };
  mount(component: PluginComponent, mode?: EditorMode | readonly EditorMode[]): () => void;
  provide(provider: SurfaceProvider, mode?: EditorMode | readonly EditorMode[]): () => void;
  registerSurface(mode: EditorMode, surface: SurfaceComponent): () => void;
}

export interface ReactEditorPlugin {
  readonly id: string;
  setup(context: ReactPluginContext): void | (() => void);
}

export interface CreateReactEditorOptions {
  readonly editor: RivtoEditorApi;
  readonly plugins?: readonly ReactEditorPlugin[];
  readonly unknownBlockRenderer?: BlockRenderer;
}

/** React-only runtime layered over the framework-neutral collaborative editor. */
export class ReactEditor {
  readonly events: EditorEvents;
  readonly keyboard: KeyboardEvents;
  readonly editor: RivtoEditorApi;
  readonly unknownBlockRenderer?: BlockRenderer;
  private readonly renderers = new Map<string, BlockRenderer>();
  private readonly surfaces = new Map<EditorMode, SurfaceComponent>();
  private readonly components: Array<ModeContribution<PluginComponent>> = [];
  private readonly providers: Array<ModeContribution<SurfaceProvider>> = [];
  private readonly pluginIds = new Set<string>();
  private readonly pluginDisposers: Array<() => void> = [];
  private readonly blockDisposers = new Set<() => void>();
  private readonly listeners = new Set<() => void>();
  private readonly unsubscribeEditor: () => void;
  private currentRevision = 0;
  private destroyed = false;

  constructor(options: CreateReactEditorOptions) {
    this.editor = options.editor;
    this.unknownBlockRenderer = options.unknownBlockRenderer;
    this.events = new EditorEvents(this.editor, () => this.editor.mode.get());
    this.keyboard = new KeyboardEvents(this.events);
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

  get revision(): number { return this.currentRevision; }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Registers model, renderer, and optional conversion command as one unit. */
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

  getRenderer(type: string): BlockRenderer | undefined {
    return this.renderers.get(type) ?? this.unknownBlockRenderer;
  }

  getSurface(mode: EditorMode): SurfaceComponent | undefined {
    return this.surfaces.get(mode);
  }

  getComponents(mode: EditorMode): PluginComponent[] {
    return this.components.filter((item) => matchesMode(item.mode, mode)).map((item) => item.value);
  }

  getProviders(mode: EditorMode): SurfaceProvider[] {
    return this.providers.filter((item) => matchesMode(item.mode, mode)).map((item) => item.value);
  }

  setRoot(root: HTMLElement | null): void {
    this.events.setRoot(root);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.pluginDisposers.reverse().forEach((dispose) => dispose());
    [...this.blockDisposers].reverse().forEach((dispose) => dispose());
    this.keyboard.destroy();
    this.events.destroy();
    this.unsubscribeEditor();
    this.listeners.clear();
  }

  private installPlugin(plugin: ReactEditorPlugin): void {
    if (!plugin.id.trim()) throw new Error("React plugin ID is required");
    if (this.pluginIds.has(plugin.id)) throw new Error(`React plugin ${plugin.id} is already registered`);
    const owned: Array<() => void> = [];
    const own = (dispose: () => void): (() => void) => {
      owned.push(dispose);
      return dispose;
    };
    const context: ReactPluginContext = {
      editor: this.editor,
      reactEditor: this,
      events: { on: (type, listener, options) => own(this.events.on(type, listener as never, options)) },
      keyboard: { bind: (shortcuts, listener, options) => own(this.keyboard.bind(shortcuts, listener, options)) },
      mount: (component, mode) => own(this.addContribution(this.components, component, mode)),
      provide: (provider, mode) => own(this.addContribution(this.providers, provider, mode)),
      registerSurface: (mode, surface) => own(this.addSurface(mode, surface)),
    };
    this.pluginIds.add(plugin.id);
    try {
      const cleanup = plugin.setup(context);
      this.pluginDisposers.push(() => {
        cleanup?.();
        owned.reverse().forEach((dispose) => dispose());
        this.pluginIds.delete(plugin.id);
      });
    } catch (error) {
      owned.reverse().forEach((dispose) => dispose());
      this.pluginIds.delete(plugin.id);
      throw error;
    }
  }

  private addSurface(mode: EditorMode, surface: SurfaceComponent): () => void {
    if (this.surfaces.has(mode)) throw new Error(`Surface ${mode} is already registered`);
    this.surfaces.set(mode, surface);
    this.changed();
    return () => {
      if (this.surfaces.get(mode) === surface) this.surfaces.delete(mode);
      this.changed();
    };
  }

  private addContribution<T>(items: Array<ModeContribution<T>>, value: T, mode?: EditorMode | readonly EditorMode[]): () => void {
    const item = { value, mode };
    items.push(item);
    this.changed();
    return () => {
      const index = items.indexOf(item);
      if (index >= 0) items.splice(index, 1);
      this.changed();
    };
  }

  private changed(): void {
    this.currentRevision += 1;
    [...this.listeners].forEach((listener) => listener());
  }

  private assertActive(): void {
    if (this.destroyed) throw new Error("React editor is destroyed");
  }
}

export const createReactEditor = (options: CreateReactEditorOptions): ReactEditor => new ReactEditor(options);

const matchesMode = (modes: EditorMode | readonly EditorMode[] | undefined, mode: EditorMode): boolean => (
  !modes || (Array.isArray(modes) ? modes.includes(mode) : modes === mode)
);
