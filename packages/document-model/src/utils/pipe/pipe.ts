/**
 * Priority band for built-in pipe steps that must run before plugin processors.
 *
 * Register internals at this value plus a small offset to keep their relative
 * order. Plugin processors should stay near `0` so they cannot outrun internals.
 */
export const PIPE_INTERNAL_PRIORITY_MIN = -1_000_000;

/**
 * Priority band for built-in pipe steps that must run after plugin processors.
 *
 * Use this value plus a small offset when a built-in step has to observe the
 * plugin-transformed value.
 */
export const PIPE_INTERNAL_PRIORITY_MAX = 1_000_000;

/**
 * One named, prioritized step in a processing pipe.
 *
 * `processor` may validate (throw) or transform (return a replacement). Steps
 * with a lower `priority` run first. Equal priorities keep map insertion order.
 *
 * @typeParam Value - Value threaded through every step.
 * @typeParam Context - Extra input shared by every step, such as parent type.
 */
export interface PipeProcessor<Value, Context = void> {
  /** Stable identity used to replace or remove this step. */
  readonly id: string;
  /** Lower values run first. Built-in steps use `PIPE_INTERNAL_PRIORITY_MIN` or `PIPE_INTERNAL_PRIORITY_MAX`. */
  readonly priority: number;
  /** Validates or transforms the current value. */
  readonly processor: (value: Value, context: Context) => Value;
}

/**
 * Ordered pipeline of processors addressed by stable id.
 *
 * Registration is a map from id to processor so a step can be replaced or
 * removed without searching by function identity. After each register or
 * unregister the executable list is rebuilt in priority order.
 *
 * @typeParam Value - Value threaded through `process`.
 * @typeParam Context - Extra input forwarded to every processor.
 */
export class Pipe<Value, Context = void> {
  /** Processors keyed by id for O(1) replacement and deletion. */
  private readonly registry = new Map<string, PipeProcessor<Value, Context>>();
  /** Priority-sorted snapshot used by `process`; rebuilt after registry edits. */
  private ordered: readonly PipeProcessor<Value, Context>[] = [];

  /**
   * Registers or replaces one processor, then rebuilds the priority-sorted list.
   *
   * @param processor - Id, priority, and function to install.
   * @returns Idempotent function that removes this id when it still owns the slot.
   * @throws {Error} When `id` is empty.
   */
  register(processor: PipeProcessor<Value, Context>): () => void {
    if (!processor.id) throw new Error("Pipe processor id is required");
    this.registry.set(processor.id, processor);
    this.rebuild();
    return () => {
      if (this.registry.get(processor.id) !== processor) return;
      this.unregister(processor.id);
    };
  }

  /**
   * Removes the processor registered under `id`.
   *
   * @param id - Registration identity to delete.
   * @returns `true` when a processor was removed.
   */
  unregister(id: string): boolean {
    if (!this.registry.delete(id)) return false;
    this.rebuild();
    return true;
  }

  /**
   * Threads `value` through every registered processor in priority order.
   *
   * An empty pipe is identity. A processor may throw to reject the value.
   *
   * @param value - Initial value entering the pipe.
   * @param context - Shared context forwarded to each processor.
   * @returns The last processor's result, or `value` when the pipe is empty.
   */
  process(value: Value, context: Context): Value {
    return this.ordered.reduce(
      (current, item) => item.processor(current, context),
      value,
    );
  }

  /**
   * Rebuilds the executable list from the registry in ascending priority.
   *
   * @returns No value.
   */
  private rebuild(): void {
    this.ordered = [...this.registry.values()].sort(
      (left, right) => left.priority - right.priority,
    );
  }
}
