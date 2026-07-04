import type { Unsubscribe } from "../../store/crdt-doc";

/**
 * Describes a command as the function callers execute.
 *
 * Commands with the default `undefined` payload take no argument. Every other
 * command takes exactly one payload, while `Result` is its return value.
 */
export type CommandSpec<Payload = undefined, Result = void> = [Payload] extends [undefined]
  ? () => Result
  : (payload: Payload) => Result;

/** Function shape accepted in a statically typed command map. */
type CommandHandler = (...args: never[]) => unknown;

/** Explicit name-to-function map used by typed registries. */
export type CommandMap = Record<string, CommandHandler>;

/** Runtime-erased command implementation stored by CommandRegistry. */
type StoredCommandHandler = (payload?: unknown) => unknown;

/**
 * Typed ownership token for a dynamically registered command.
 *
 * A plugin cannot change the static command map of an already-created runtime.
 * The handle therefore carries the plugin command's local payload and result
 * types while the registry retains its stable built-in type surface.
 */
export interface RegisteredCommand<Handler extends CommandHandler> {
  /** Stable registered command ID. */
  readonly name: string;
  /** Executes this command without losing its local payload/result types. */
  execute(...args: Parameters<Handler>): ReturnType<Handler>;
  /** Removes this exact registration; repeated calls are harmless. */
  dispose(): void;
}

/**
 * Owns every command available to views, plugins, and host applications.
 *
 * `Commands` provides exact name, payload, and result inference for the stable
 * runtime API. Extensions remain dynamic by nature and use `registerDynamic`
 * plus its typed handle, or the explicit `executeDynamic` escape hatch.
 * Runtime validation still belongs to each command because TypeScript types
 * disappear for JavaScript callers and external data.
 *
 * @typeParam Commands - Static command names and their CommandSpec contracts.
 */
export class CommandRegistry<Commands extends CommandMap = Record<string, CommandSpec<unknown, unknown>>> {
  private readonly handlers = new Map<string, StoredCommandHandler>();
  private readonly listeners = new Set<() => void>();
  private currentLastExecuted: string | null = null;

  /** Returns the last command whose handler completed without throwing. */
  get lastExecuted(): string | null { return this.currentLastExecuted; }

  /**
   * Registers an implementation for a command declared in the static map.
   *
   * @param name - Command ID from the registry's command map.
   * @param handler - Exactly typed command implementation.
   * @returns Typed ownership and execution handle.
   */
  register<Name extends keyof Commands & string>(
    name: Name,
    handler: Commands[Name],
  ): RegisteredCommand<Commands[Name]> {
    return this.add(name, handler);
  }

  /**
   * Registers a command whose name is introduced at runtime, normally by a plugin.
   *
   * Keep and execute through the returned handle when possible. It preserves
   * the extension's types without falsely adding its name to every runtime.
   */
  registerDynamic<Payload = undefined, Result = void>(
    name: string,
    handler: CommandSpec<Payload, Result>,
  ): RegisteredCommand<CommandSpec<Payload, Result>> {
    return this.add(name, handler);
  }

  /** Reports whether a command name currently resolves to a handler. */
  has(name: string): boolean { return this.handlers.has(name); }

  /** Executes a command declared in the static command map. */
  execute<Name extends keyof Commands & string>(
    name: Name,
    ...args: Parameters<Commands[Name]>
  ): ReturnType<Commands[Name]> {
    return this.run(name, args[0]) as ReturnType<Commands[Name]>;
  }

  /**
   * Executes a command known only at runtime.
   *
   * Prefer a `RegisteredCommand` handle when the caller installed the command;
   * this escape hatch exists for declarative UI items and separately loaded plugins.
   */
  executeDynamic<Result = unknown>(name: string, payload?: unknown): Result {
    return this.run(name, payload) as Result;
  }

  /** Subscribes to successful command executions. */
  subscribe(listener: () => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Removes all commands and observers during runtime destruction. */
  clear(): void { this.handlers.clear(); this.listeners.clear(); }

  /** Adds one erased handler while returning a locally typed ownership handle. */
  private add<Handler extends CommandHandler>(name: string, handler: Handler): RegisteredCommand<Handler> {
    if (!name) throw new Error("Command name is required");
    if (this.handlers.has(name)) throw new Error(`Command ${name} is already registered`);
    const stored = handler as unknown as StoredCommandHandler;
    this.handlers.set(name, stored);
    let active = true;
    const dispose = (): void => {
      if (!active) return;
      active = false;
      if (this.handlers.get(name) === stored) this.handlers.delete(name);
    };
    return {
      name,
      execute: (...args: Parameters<Handler>) => this.run(name, args[0]) as ReturnType<Handler>,
      dispose,
    };
  }

  /** Runs the erased handler and publishes only successful completion. */
  private run(name: string, payload?: unknown): unknown {
    const handler = this.handlers.get(name);
    if (!handler) throw new Error(`Unknown command ${name}`);
    const result = handler(payload);
    this.currentLastExecuted = name;
    [...this.listeners].forEach((listener) => listener());
    return result;
  }
}
