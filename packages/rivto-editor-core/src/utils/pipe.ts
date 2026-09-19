/**
 * Provides the editor-owned priority processor pipeline.
 *
 * Processor configuration belongs to one editor runtime and never mutates a
 * document model, allowing several differently configured editors to share the
 * same document safely.
 */

/** One named transformation or validation step in an editor pipeline. */
export interface PipeProcessor<Value, Context = void> {
  /** Stable identity used for replacement and removal. */
  readonly id: string;
  /** Lower values execute first. */
  readonly priority: number;
  /**
   * Processes one value.
   * @param value - Current pipeline value.
   * @param context - Operation context shared by processors.
   * @returns Processed value.
   */
  readonly processor: (value: Value, context: Context) => Value;
}

/** Priority-ordered processor registry owned by one editor manager. */
export class Pipe<Value, Context = void> {
  private readonly registry = new Map<string, PipeProcessor<Value, Context>>();
  private ordered: readonly PipeProcessor<Value, Context>[] = [];

  /**
   * Registers or replaces a processor.
   * @param processor - Processor to register.
   * @returns Idempotent disposer for this exact registration.
   */
  register(processor: PipeProcessor<Value, Context>): () => void {
    if (!processor.id) throw new Error("Pipe processor id is required");
    this.registry.set(processor.id, processor);
    this.rebuild();
    return () => {
      if (this.registry.get(processor.id) !== processor) return;
      this.registry.delete(processor.id);
      this.rebuild();
    };
  }

  /**
   * Gets a processor by its stable identifier.
   * @param id - Processor identifier.
   * @returns Registered processor, or undefined when absent.
   */
  get(id: string): PipeProcessor<Value, Context> | undefined {
    return this.registry.get(id);
  }

  /**
   * Deletes a processor by its stable identifier.
   * @param id - Processor identifier.
   * @returns Whether a processor was removed.
   */
  delete(id: string): boolean {
    const deleted = this.registry.delete(id);
    if (deleted) this.rebuild();
    return deleted;
  }

  /**
   * Processes a value with the current ordered processors.
   * @param value - Initial value.
   * @param context - Operation context.
   * @returns Final processed value.
   */
  process(value: Value, context: Context): Value {
    return this.ordered.reduce((current, item) => item.processor(current, context), value);
  }

  /** @returns No value after rebuilding the priority snapshot. */
  private rebuild(): void {
    this.ordered = [...this.registry.values()].sort((left, right) => left.priority - right.priority);
  }
}
