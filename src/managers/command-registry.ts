/** Function shape accepted by the command registry. */
export type CommandHandler = (payload?: unknown) => unknown;

/**
 * Ownership token for one registered command.
 *
 * The handle can execute or dispose only the exact command registration that
 * created it.
 */
export interface RegisteredCommand {
  /** Stable registered command ID. */
  readonly name: string;
  /** Executes this command through the registry. */
  execute(payload?: unknown): unknown;
  /** Removes this exact registration; repeated calls are harmless. */
  dispose(): void;
}

/**
 * Owns command handlers available to views, integrations, and later plugins.
 *
 * The registry is intentionally runtime-first: commands are addressed by
 * string ID and receive one optional payload. Individual commands own their
 * payload validation because external callers are not guaranteed to be typed.
 */
export class CommandRegistry {
  private readonly handlers = new Map<string, CommandHandler>();
  private readonly listeners = new Set<() => void>();
  private currentLastExecuted: string | null = null;

  /** Returns the last command whose handler completed without throwing. */
  get lastExecuted(): string | null { return this.currentLastExecuted; }

  /**
   * Registers one command handler until the returned disposer is called.
   *
   * @param name - Unique, non-empty command ID.
   * @param handler - Runtime command implementation.
   * @returns Ownership handle for this exact registration.
   * @throws If the command name is empty or already registered.
   */
  register(name: string, handler: CommandHandler): RegisteredCommand {
    if (!name) throw new Error("Command name is required");
    if (this.handlers.has(name)) throw new Error(`Command ${name} is already registered`);
    this.handlers.set(name, handler);
    let active = true;
    const dispose = (): void => {
      if (!active) return;
      active = false;
      if (this.handlers.get(name) === handler) this.handlers.delete(name);
    };
    return {
      name,
      execute: (payload?: unknown) => this.execute(name, payload),
      dispose,
    };
  }

  /**
   * Reports whether a command name currently resolves to a handler.
   *
   * @param name - Command ID to inspect.
   * @returns `true` when a handler is registered.
   */
  has(name: string): boolean {
    return this.handlers.has(name);
  }

  /**
   * Removes a command by name.
   *
   * @param name - Command ID to remove.
   */
  remove(name: string): void {
    this.handlers.delete(name);
  }

  /**
   * Executes a registered command and notifies subscribers after success.
   *
   * @param name - Command ID to execute.
   * @param payload - Optional runtime payload passed to the handler.
   * @returns The command handler result.
   * @throws If no handler owns the command name, or if the handler throws.
   */
  execute(name: string, payload?: unknown): unknown {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Unknown command ${name}`);
    const result = handler(payload);
    this.currentLastExecuted = name;
    [...this.listeners].forEach((listener) => listener());
    return result;
  }

  /**
   * Subscribes to successful command executions.
   *
   * @param listener - Callback called after a command handler completes.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Removes all commands and observers during runtime destruction. */
  clear(): void {
    this.handlers.clear();
    this.listeners.clear();
  }
}
