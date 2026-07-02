import type { BlockDefinition, SlashItem } from "../blocks";
import type { BlockRegistry } from "../blocks";
import type { RivtoEditorApi } from "../editor/types";

/** Trusted runtime extension installed into an editor instance. */
export interface RivtoPlugin {
  /** Unique owner ID for definitions, commands, and lifecycle cleanup. */
  id: string;
  /** Block definitions installed for the plugin's lifetime. */
  blocks?: BlockDefinition[];
  /** Named commands receiving the public editor API as their first argument. */
  commands?: Record<string, (editor: RivtoEditorApi, ...args: unknown[]) => unknown>;
  /** Additional actions not generated from block definitions. */
  slashItems?: SlashItem[];
  /** Optional lifecycle setup returning plugin-owned cleanup. */
  setup?: (editor: RivtoEditorApi) => void | (() => void);
}

/** Owns trusted plugin lifecycle and named commands, but not block definitions. */
export class PluginManager {
  private readonly plugins = new Map<string, { plugin: RivtoPlugin; dispose?: () => void; removeBlocks: Array<() => void> }>();
  private readonly commands = new Map<string, { pluginId: string; run: (...args: unknown[]) => unknown }>();

  /**
   * Creates a plugin coordinator around the editor's shared block registry.
   *
   * @param getEditor - Lazy accessor avoiding construction-time cycles.
   * @param blocks - Registry that owns plugin block definitions.
   * @param onChange - Callback used to invalidate editor views after lifecycle changes.
   */
  constructor(
    private readonly getEditor: () => RivtoEditorApi,
    private readonly blocks: BlockRegistry,
    private readonly onChange: () => void,
  ) {}

  /**
   * Installs a plugin atomically and returns its disposer.
   *
   * @param plugin - Trusted local plugin with a unique ID and command names.
   * @returns Idempotent function that uninstalls this plugin.
   * @throws If the plugin, a block type, or a command name is already registered.
   */
  use(plugin: RivtoPlugin): () => void {
    if (this.plugins.has(plugin.id)) throw new Error(`Plugin ${plugin.id} is already registered`);
    const removeBlocks: Array<() => void> = [];
    const addedCommands: string[] = [];
    try {
      (plugin.blocks ?? []).forEach((definition) => removeBlocks.push(this.blocks.register(definition)));
      for (const [name, command] of Object.entries(plugin.commands ?? {})) {
        if (this.commands.has(name)) throw new Error(`Command ${name} is already registered`);
        this.commands.set(name, { pluginId: plugin.id, run: (...args) => command(this.getEditor(), ...args) });
        addedCommands.push(name);
      }
      const dispose = plugin.setup?.(this.getEditor()) || undefined;
      this.plugins.set(plugin.id, { plugin, dispose, removeBlocks });
    } catch (error) {
      removeBlocks.reverse().forEach((remove) => remove());
      addedCommands.forEach((name) => this.commands.delete(name));
      throw error;
    }
    this.onChange();
    return () => this.unuse(plugin.id);
  }

  /**
   * Removes one plugin and every resource registered under its ownership.
   *
   * @param id - Stable plugin ID to remove.
   */
  unuse(id: string): void {
    const current = this.plugins.get(id);
    if (!current) return;
    current.dispose?.();
    current.removeBlocks.reverse().forEach((remove) => remove());
    for (const [name, command] of this.commands) if (command.pluginId === id) this.commands.delete(name);
    this.plugins.delete(id);
    this.onChange();
  }

  /**
   * Runs a named plugin command against the current editor.
   *
   * @param name - Globally unique command name.
   * @param args - Command-specific arguments.
   * @returns Command result without runtime coercion.
   * @throws If no installed plugin owns the command.
   */
  run(name: string, ...args: unknown[]): unknown {
    const command = this.commands.get(name);
    if (!command) throw new Error(`Unknown command ${name}`);
    return command.run(...args);
  }

  /**
   * Returns plugin-owned slash actions in installation order.
   *
   * @returns Fresh array safe for view-level filtering.
   */
  getSlashItems(): SlashItem[] {
    return [...this.plugins.values()].flatMap(({ plugin }) => plugin.slashItems ?? []);
  }

  /** Uninstalls all plugins and clears every command during editor destruction. */
  destroy(): void {
    [...this.plugins.keys()].reverse().forEach((id) => this.unuse(id));
    this.commands.clear();
  }
}
