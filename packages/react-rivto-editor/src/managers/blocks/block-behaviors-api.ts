import type { EditorBlock } from "@chulane/rivto";
import type { BlockBehavior, BlockBehaviorAction, BlockDropDestination } from "../../block-behaviors/types";

/** Per-type outline, split, and drop behavior resolved by page dispatchers. */
export interface BlockBehaviorsApi {
  /**
   * Resolves the context block's behavior and falls back when it defers.
   * @param action - Semantic operation to invoke.
   * @param args - Block context and operation-specific arguments.
   * @returns True when the operation was handled or explicitly rejected.
   */
  dispatch<Action extends BlockBehaviorAction>(action: Action, ...args: Parameters<BlockBehavior[Action]>): boolean;
  /**
   * Registers one shared behavior instance for a persisted block type.
   * @param type - Non-empty type name, unique within this registry.
   * @param behavior - Instance used by every block of this type; read per-block state from context.
   * @returns Idempotent disposer, also released with the registering extension.
   * @throws If the type is empty, already registered, or the runtime is destroyed.
   */
  register(type: string, behavior: BlockBehavior): () => void;
  /**
   * Removes the behavior registered for a persisted block type.
   * @param type - Exact registered type name to remove.
   * @returns Whether a registration was found and disposed.
   * @throws If the runtime is destroyed.
   */
  delete(type: string): boolean;
  /**
   * Looks up an exact type registration without using the default behavior.
   * @param type - Persisted block type name.
   * @returns Registered instance, or undefined when no behavior is registered for this type.
   */
  get(type: string): BlockBehavior | undefined;
  /**
   * Checks whether a behavior is explicitly registered for a type.
   * @param type - Persisted block type name.
   * @returns Whether an exact registration exists; the shared fallback does not count.
   */
  has(type: string): boolean;
  /**
   * Reads a block's current type and selects its interaction behavior.
   * @param blockId - ID of the block whose type should be read.
   * @returns Registered instance, or fallback for missing blocks and unregistered types.
   * Returning a fallback does not establish that the block exists or can be edited.
   */
  resolve(blockId: string): BlockBehavior;
  /**
   * Checks behavior restrictions for source blocks at a destination parent.
   *
   * Checks allowed child types, allowed parent types, and the parent's acceptsDrop()
   * hook. This is not a complete hierarchy check; callers still validate the move.
   * @param destination - Child position or container receiving the dragged roots.
   * @param sources - Source snapshots, possibly from another document.
   * @returns False for empty sources, a missing destination parent, or a refused type
   * or hook check; true when all behavior restrictions permit the drop.
   */
  acceptsDrop(destination: BlockDropDestination, sources: readonly EditorBlock[]): boolean;
  /** Shared generic behavior used when a type registers no specialization. */
  readonly fallback: BlockBehavior;
}
