import { BlockRegistry, defaultBlockDefinitions, type BlockDefinition } from "../blocks";
import { CommandRegistry, type CommandHandler, type RegisteredCommand, ModeManager } from "../managers";
import { YjsDoc } from "../store/crdt-doc";
import { DocumentModelImpl, type BlockInput, type BlockLayout, type BlockPatch } from "../store/document-model";
import type { CreateRivtoEditorOptions, RivtoEditorApi } from "./types";

/**
 * Owns the active document, block registry, commands, and editor mode.
 *
 * The runtime currently registers only block-level commands. It connects
 * document, block definition, and mode changes to a single revision stream
 * that React can subscribe to with `useSyncExternalStore`.
 */
export class EditorRuntime implements RivtoEditorApi {
  readonly document: DocumentModelImpl;
  readonly blocks = new BlockRegistry();
  readonly commands = new CommandRegistry();
  readonly mode: ModeManager;
  private readonly listeners = new Set<() => void>();
  /** Unsubscribe callbacks owned by the runtime and called during destroy(). */
  private readonly unsubscribeFns: Array<() => void> = [];
  private readonly removeDefinitions = new Set<() => void>();
  private currentRevision = 0;

  /**
   * Creates a runtime with a collaborative document, default blocks, and mode.
   *
   * @param options - Optional document adapter and startup mode.
   */
  constructor(options: CreateRivtoEditorOptions = {}) {
    this.document = new DocumentModelImpl(options.document ?? new YjsDoc(`rivto-${crypto.randomUUID()}`));
    this.mode = new ModeManager(options.mode ?? "block");
    this.document.setPropsValidator((type, props) => this.blocks.validate(type, props));
    this.registerBlockCommands();
    defaultBlockDefinitions.forEach((definition) => this.defineBlock(definition));

    // Document changes cover block commands and direct/remote document edits.
    const unsubscribeFromDocumentChanges = this.document.subscribe(() => this.changed());
    this.unsubscribeFns.push(unsubscribeFromDocumentChanges);
    // Mode changes are local runtime state, so they still notify directly.
    const unsubscribeFromModeChanges = this.mode.subscribe(() => this.changed());
    this.unsubscribeFns.push(unsubscribeFromModeChanges);
  }

  /** Current runtime revision, incremented after every observable change. */
  get revision(): number { return this.currentRevision; }

  /**
   * Subscribes to runtime revision changes.
   *
   * @param listener - Callback called after an observable runtime change.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Registers one command on this runtime.
   *
   * @param name - Unique, non-empty command ID.
   * @param handler - Runtime command implementation.
   * @returns Ownership handle for this exact registration.
   */
  register(name: string, handler: CommandHandler): RegisteredCommand {
    return this.commands.register(name, handler);
  }

  /**
   * Executes a registered runtime command.
   *
   * @param name - Command ID to execute.
   * @param payload - Optional runtime payload passed to the handler.
   * @returns The command handler result.
   */
  execute(name: string, payload?: unknown): unknown {
    return this.commands.execute(name, payload);
  }

  /**
   * Removes a command from this runtime by name.
   *
   * @param name - Command ID to remove.
   */
  removeCommand(name: string): void {
    this.commands.remove(name);
  }

  /**
   * Registers one block definition for this editor instance.
   *
   * @param definition - Definition for a unique, non-empty native type.
   * @returns Idempotent function that unregisters this definition and updates subscribers.
   */
  defineBlock(definition: BlockDefinition): () => void {
    const unregister = this.blocks.register(definition);
    let active = true;
    const dispose = () => {
      if (!active) return;
      active = false;
      unregister();
      this.removeDefinitions.delete(dispose);
      this.changed();
    };
    this.removeDefinitions.add(dispose);
    this.changed();
    return dispose;
  }

  /**
   * Registers built-in commands that mutate block data.
   *
   * Commands validate their small runtime payloads, then delegate storage and
   * CRDT behavior to DocumentModelImpl.
   */
  private registerBlockCommands(): void {
    type Payload = Record<string, unknown>;
    const payload = (value: unknown): Payload => {
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Command payload must be an object");
      return value as Payload;
    };
    const string = (value: unknown, name: string): string => {
      if (typeof value !== "string") throw new Error(`${name} must be a string`);
      return value;
    };

    this.commands.register("block.insert", (value) => {
      const data = payload(value);
      const block = payload(data.block) as unknown as BlockInput;
      if (typeof block.type !== "string") throw new Error("block.type must be a string");
      const definition = this.blocks.get(block.type);
      const render = definition?.render;
      if (!definition || (render && typeof render !== "function" && !render[this.mode.get()])) {
        throw new Error(`Block type ${block.type} is unavailable in ${this.mode.get()} mode`);
      }
      const afterId = data.afterId === undefined ? undefined : data.afterId === null ? null : string(data.afterId, "afterId");
      return this.document.insertBlock(this.blocks.prepare(block), afterId);
    });
    this.commands.register("block.update", (value) => {
      const data = payload(value);
      this.document.updateBlock(string(data.id, "id"), payload(data.patch) as BlockPatch);
    });
    this.commands.register("block.remove", (value) => {
      const data = payload(value);
      this.document.removeBlock(string(data.id, "id"));
    });
    this.commands.register("block.move", (value) => {
      const data = payload(value);
      this.document.moveBlock(string(data.id, "id"), data.afterId === null ? null : string(data.afterId, "afterId"));
    });
    this.commands.register("block.indent", (value) => {
      const data = payload(value);
      this.document.indentBlock(string(data.id, "id"));
    });
    this.commands.register("block.outdent", (value) => {
      const data = payload(value);
      this.document.outdentBlock(string(data.id, "id"));
    });
    this.commands.register("block.prop.set", (value) => {
      const data = payload(value);
      this.document.setBlockProp(string(data.id, "id"), string(data.key, "key"), data.value);
    });
    this.commands.register("block.pluginData.set", (value) => {
      const data = payload(value);
      this.document.setPluginData(string(data.id, "id"), string(data.pluginId, "pluginId"), data.value);
    });
    this.commands.register("block.layout.set", (value) => {
      const data = payload(value);
      this.document.setBlockLayout(string(data.id, "id"), payload(data.layout) as Partial<BlockLayout>);
    });
  }

  /**
   * Releases subscriptions owned by the runtime.
   *
   * Registered block definitions are removed in reverse order so callers see a
   * predictable teardown path even when definitions depend on earlier defaults.
   */
  destroy(): void {
    this.unsubscribeFns.splice(0).forEach((unsubscribe) => unsubscribe());
    [...this.removeDefinitions].reverse().forEach((dispose) => dispose());
    this.commands.clear();
    this.listeners.clear();
  }

  /** Publishes one observable runtime change to subscribers. */
  private changed(): void {
    this.currentRevision += 1;
    this.listeners.forEach((listener) => listener());
  }
}

export function createRivtoEditor(options: CreateRivtoEditorOptions = {}): EditorRuntime {
  return new EditorRuntime(options);
}
