import { dispatchBlockAction } from "../../block-behaviors/dispatch";
/**
 * Registry of per-type block behaviors with a shared generic fallback.
 *
 * Storage is independent from renderers so a losslessly loaded unknown type
 * still receives {@link DefaultBlockBehavior}. Normal custom blocks register a behavior
 * through {@link BlockTypeManager.register} alongside their definition.
 *
 * @module
 */
import type { EditorBlock } from "@chulane/rivto";
import { DefaultBlockBehavior } from "../../block-behaviors/default-block-behavior";
import type { BlockBehavior, BlockBehaviorAction, BlockDropDestination } from "../../block-behaviors/types";
import type { EditorRuntime } from "../../editor/editor-runtime";
import type { BlockBehaviorsApi } from "./block-behaviors-api";

/** Shared fallback used for unregistered and unknown block types. */
const defaultBlockBehavior = new DefaultBlockBehavior();

/**
 * Stores the interaction behavior registered for each persisted block type.
 *
 * BlockTypeManager normally registers definition, renderer, and behavior together
 * with rollback if any registration fails. This registry also supports independent
 * behavior registration when a block type is already defined. Unknown types and
 * types without a registration use the shared DefaultBlockBehavior instance.
 *
 * resolve() reads a block's current type; get() only looks up an exact type name.
 * The registry dispatches keyboard actions and checks drag destinations, but does
 * not render blocks or keep per-block interaction state on behavior instances.
 */
export class BlockBehaviorRegistry implements BlockBehaviorsApi {
  private readonly behaviors = new Map<string, {
    readonly behavior: BlockBehavior;
    dispose: () => void;
  }>();

  /**
   * Creates a behavior registry bound to one React runtime.
   *
   * @param editorRuntime - Owning React runtime providing blocks and extension lifecycle.
   */
  constructor(private readonly editorRuntime: EditorRuntime) {}

  /**
   * Registers one behavior object for a unique non-empty block type.
   *
   * @param type - Persisted block type resolved by dispatchers.
   * @param behavior - Behavior instance consulted for that type.
   * @returns Idempotent disposer removing this exact behavior.
   * @throws If the type is empty, already registered, or the runtime is destroyed.
   */
  register(type: string, behavior: BlockBehavior): () => void {
    this.editorRuntime.extensions.assertActive();
    if (!type.trim()) throw new Error("Block behavior type is required");
    if (this.behaviors.has(type)) throw new Error(`Block behavior ${type} is already registered`);
    const registration: {
      readonly behavior: BlockBehavior;
      dispose: () => void;
    } = {
      behavior,
      dispose: () => undefined,
    };
    this.behaviors.set(type, registration);
    registration.dispose = this.editorRuntime.extensions.own(() => {
      if (this.behaviors.get(type) !== registration) return;
      this.behaviors.delete(type);
    });
    return registration.dispose;
  }

  /**
   * Deletes the exact behavior registered for a block type.
   *
   * @param type - Persisted block type whose behavior is removed.
   * @returns `true` when a behavior existed and was disposed.
   */
  delete(type: string): boolean {
    this.editorRuntime.extensions.assertActive();
    const registration = this.behaviors.get(type);
    if (!registration) return false;
    registration.dispose();
    return true;
  }

  /**
   * Returns the registered behavior for a type, or `undefined` when absent.
   *
   * @param type - Persisted block type to resolve.
   * @returns The registered instance, without falling back to the generic behavior.
   */
  get(type: string): BlockBehavior | undefined {
    return this.behaviors.get(type)?.behavior;
  }

  /**
   * Reports whether an exact type behavior is registered, excluding the fallback.
   *
   * @param type - Persisted block type to inspect.
   * @returns `true` when this manager owns a behavior for that type.
   */
  has(type: string): boolean {
    return this.behaviors.has(type);
  }

  /**
   * Reads a block's current type and selects the registered behavior for that type.
   *
   * Blocks with no custom behavior, unknown types, and missing block IDs all use
   * the shared DefaultBlockBehavior. Resolution does not verify that an operation
   * can run on a missing block; handlers must first obtain their block context.
   * @param blockId - Document-local ID used to read the block's current type.
   * @returns The registered instance, or the shared default without creating an instance.
   */
  resolve(blockId: string): BlockBehavior {
    const type = this.editorRuntime.blocks.getBlockNode(blockId)?.type;
    return (type && this.behaviors.get(type)?.behavior) || this.fallback;
  }

  /**
   * Resolves the block's behavior and runs the shared fallback when it defers.
   * @param action - Semantic operation requested by an extension.
   * @param args - Current block context and arguments for that operation.
   * @returns Whether the operation handled or explicitly rejected the request.
   */
  dispatch<Action extends BlockBehaviorAction>(action: Action, ...args: Parameters<BlockBehavior[Action]>): boolean {
    return dispatchBlockAction(this.resolve(args[0].block.id), this.fallback, action, ...args);
  }

  /**
   * Checks behavior restrictions for all moved roots at their destination parent.
   *
   * Checks the parent's allowed child types and each source behavior's allowed
   * parent types before consulting the destination behavior's acceptance hook.
   * Root-level destinations use the generic fallback behavior. Callers still
   * validate the move itself, including hierarchy constraints and source identity.
   *
   * @param destination - Canonical gap or container receiving the moved roots.
   * @param sources - Source blocks whose types and content must be accepted.
   * @returns `true` when sources are non-empty, the destination parent exists
   * when specified, and all type restrictions and the acceptance hook pass.
   */
  acceptsDrop(destination: BlockDropDestination, sources: readonly EditorBlock[]): boolean {
    const parent = destination.parentId
      ? this.editorRuntime.blocks.getBlock(destination.parentId)
      : undefined;
    if (destination.parentId && !parent) return false;
    const behavior = parent ? this.resolve(parent.id) : this.fallback;
    return sources.length > 0 && sources.every((source) => {
      const sourceBehavior = this.get(source.type) ?? this.fallback;
      return (!behavior.dropChildTypes || behavior.dropChildTypes.includes(source.type))
        && (!sourceBehavior.dropParentTypes || Boolean(parent && sourceBehavior.dropParentTypes.includes(parent.type)));
    }) && behavior.acceptsDrop({ editor: this.editorRuntime, destination, sources });
  }

  /** Shared generic behavior used when a type registers no specialization. */
  get fallback(): DefaultBlockBehavior {
    return defaultBlockBehavior;
  }

}
