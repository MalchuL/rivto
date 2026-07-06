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
 * Typed ownership token for a registered command.
 *
 * The handle carries the command's payload and result types and can execute or
 * dispose only the exact registration that created it.
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
 * runtime API. Extensions pass their own command map as the explicit generic
 * to `register()` or `execute()`; no second dynamic API is necessary.
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
  register<Available extends CommandMap = Commands, Name extends keyof Available & string = keyof Available & string>(
    name: Name,
    handler: Available[Name],
  ): RegisteredCommand<Available[Name]> {
    return this.add(name, handler);
  }

  /** Reports whether a command name currently resolves to a handler. */
  has(name: string): boolean { return this.handlers.has(name); }

  /** Executes a command declared in the static command map. */
  execute<Available extends CommandMap = Commands, Name extends keyof Available & string = keyof Available & string>(
    name: Name,
    ...args: Parameters<Available[Name]>
  ): ReturnType<Available[Name]> {
    return this.run(name, args[0]) as ReturnType<Available[Name]>;
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
