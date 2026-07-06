import type { BlockDefinition } from "../blocks";
import type { SlashItem } from "../plugins";
import type { EditorMode, RivtoEditorApi, RuntimeEventHandler, RuntimeEventType } from "../editor/types";
import type { BlockRegistry } from "../blocks";
import type { CommandRegistry } from "./command-registry";
import type { EventRouter } from "./event-router";
import type { UIContribution, UIRegistry } from "./ui-registry";

export interface RivtoPlugin {
  /** Unique owner ID for every contribution and lifecycle resource. */
  id: string;
  /** Modes in which inherited blocks, commands, events, and UI are active. */
  modes?: EditorMode[];
  /** Native block definitions installed for the plugin lifetime. */
  blocks?: BlockDefinition[];
  /** Named commands receiving only the public runtime API. */
  commands?: Record<string, (editor: RivtoEditorApi, payload?: unknown) => unknown>;
  /** Normalized interaction handlers installed in EventRouter. */
  events?: Partial<Record<RuntimeEventType, RuntimeEventHandler>>;
  /** Normalized handlers scoped to persisted block types. */
  blockEvents?: Record<string, Partial<Record<RuntimeEventType, RuntimeEventHandler>>>;
  /** Slash actions owned entirely by this plugin. */
  slashItems?: SlashItem[];
  /** Command-backed toolbar or side-menu actions. */
  ui?: UIContribution[];
  /** Optional setup hook returning plugin-owned cleanup. */
  setup?: (editor: RivtoEditorApi) => void | (() => void);
}

interface InstalledPlugin {
  /** Original contribution metadata used for mode-aware queries. */
  plugin: RivtoPlugin;
  /** Cleanup returned from the setup hook. */
  cleanup?: () => void;
  /** Registry disposers in registration order. */
  remove: Array<() => void>;
}

/**
 * Atomically installs and removes every resource owned by a trusted plugin.
 *
 * Each specialized registry continues to enforce its own uniqueness rules.
 * PluginManager adds lifecycle ownership: partial installation is rolled back
 * if any later contribution or setup hook throws, and uninstall removes the
 * successfully registered resources in reverse order.
 */
export class PluginManager {
  private readonly installed = new Map<string, InstalledPlugin>();

  /**
   * Connects plugin ownership to the runtime's specialized registries.
   *
   * Accessors are lazy because the manager is created while EditorRuntime is
   * still constructing itself.
   */
  constructor(
    private readonly getEditor: () => RivtoEditorApi,
    private readonly blocks: BlockRegistry,
    private readonly commands: CommandRegistry,
    private readonly events: EventRouter,
    private readonly ui: UIRegistry,
    private readonly getMode: () => EditorMode,
    private readonly onChange: () => void,
  ) {}

  /**
   * Atomically installs a plugin and returns its lifecycle disposer.
   *
   * Plugin-level modes become defaults for UI items and all event handlers.
   * Commands
   * stay registered so name ownership is stable, then reject execution while
   * their plugin is inactive.
   *
   * @param plugin - Trusted local extension to install.
   * @returns Function that uninstalls this plugin.
   * @throws If the plugin or any contribution conflicts or setup fails.
   */
  use(plugin: RivtoPlugin): () => void {
    if (this.installed.has(plugin.id)) throw new Error(`Plugin ${plugin.id} is already registered`);
    const remove: Array<() => void> = [];
    try {
      plugin.blocks?.forEach((block) => remove.push(this.blocks.register(block)));
      for (const [name, handler] of Object.entries(plugin.commands ?? {})) {
        const command = this.commands.register<Record<string, (payload: unknown) => unknown>>(name, (payload) => {
          if (plugin.modes && !plugin.modes.includes(this.getMode())) throw new Error(`Command ${name} is unavailable in ${this.getMode()} mode`);
          return handler(this.getEditor(), payload);
        });
        remove.push(command.dispose);
      }
      for (const [type, handler] of Object.entries(plugin.events ?? {}) as Array<[RuntimeEventType, RuntimeEventHandler]>) {
        remove.push(this.events.registerPlugin(plugin.id, type, handler, plugin.modes));
      }
      for (const [blockType, handlers] of Object.entries(plugin.blockEvents ?? {})) {
        for (const [type, handler] of Object.entries(handlers) as Array<[RuntimeEventType, RuntimeEventHandler]>) {
          remove.push(this.events.registerBlock(plugin.id, blockType, type, handler, plugin.modes));
        }
      }
      plugin.ui?.forEach((item) => remove.push(this.ui.register({ ...item, modes: item.modes ?? plugin.modes })));
      const cleanup = plugin.setup?.(this.getEditor()) || undefined;
      this.installed.set(plugin.id, { plugin, cleanup, remove });
    } catch (error) {
      // A plugin may have registered several valid resources before a later
      // duplicate is discovered. Reverse rollback restores the exact runtime
      // state that existed before `use()` began.
      remove.reverse().forEach((dispose) => dispose());
      throw error;
    }
    this.onChange();
    return () => this.unuse(plugin.id);
  }

  /**
   * Removes every resource owned by a plugin.
   *
   * Setup cleanup runs before registry removal so it can still access its own
   * commands and definitions while releasing subscriptions.
   *
   * @param id - Installed plugin ID; unknown IDs are ignored.
   */
  unuse(id: string): void {
    const current = this.installed.get(id);
    if (!current) return;
    current.cleanup?.();
    current.remove.reverse().forEach((dispose) => dispose());
    this.installed.delete(id);
    this.onChange();
  }

  /** Returns an installed plugin for framework-specific adapter integration. */
  get(id: string): RivtoPlugin | undefined { return this.installed.get(id)?.plugin; }

  /** Returns detached slash items contributed by active-mode plugins. */
  getSlashItems(): SlashItem[] {
    const mode = this.getMode();
    return [...this.installed.values()].flatMap(({ plugin }) =>
      !plugin.modes || plugin.modes.includes(mode) ? plugin.slashItems ?? [] : []);
  }

  /** Uninstalls all plugins in reverse installation order. */
  destroy(): void { [...this.installed.keys()].reverse().forEach((id) => this.unuse(id)); }
}
