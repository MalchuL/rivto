import type { BlocksCapability } from "../../capabilities";
import { getBlockContainment, type ReactBlockRegistration } from "./block-types";
import type {
  BlockListProps,
  BlockManager as CoreBlockManager,
  BlockRegistryManager,
  EditorBlockInput,
  EditorBlockPatch,
  EditorBlockUpdate,
  RivtoEditorApi,
} from "@chulane/rivto";
import { validateBlockListProps } from "@chulane/rivto";
import type { BlockMutationResult, ListPropsRegistration } from "./block-types";
import type { ReactEditorImpl } from "../../react-editor";

/**
 * Atomically connects a core block definition to React presentation.
 *
 * The manager coordinates existing core definitions, RendererManager, and the
 * shared slash registry without becoming another block-data store.
 */
export class BlockManager implements BlocksCapability {
  private readonly registrations = new Map<string, () => void>();
  private readonly blockElementSeparatorTypes = new Set<string>();
  private readonly listPropsRegistrations: ListPropsRegistration[] = [];

  /**
   * Creates the atomic block-extension facade.
   *
   * @param reactEditor - Owning React runtime providing presentation managers.
   * @param editor - Core runtime providing block definitions and mutations.
   */
  constructor(
    private readonly reactEditor: ReactEditorImpl,
    private readonly editor: RivtoEditorApi,
  ) {}

  /**
   * Registers definition, renderer, and optional type conversion as one unit.
   *
   * @param registration - Complete custom block integration.
   * @returns Idempotent disposer releasing every installed part in reverse.
   * @throws On definition, renderer, or slash-command conflicts.
   */
  register(registration: ReactBlockRegistration): () => void {
    const { blocks: core, blocksRegistry: registry } = this.editor;
    const { extensions, renderers, slashCommands, views } = this.reactEditor;
    extensions.assertActive();
    const { definition, render, slashCommand, view } = registration;
    if (renderers.has(definition.type)) {
      throw new Error(`Block renderer ${definition.type} is already registered`);
    }

    const disposers: Array<() => void> = [];
    try {
      const existing = registry.get(definition.type);
      if (existing) {
        const containment = getBlockContainment(definition);
        const existingContainment = getBlockContainment(existing);
        if (containment && (
          existingContainment?.childOutline !== containment.childOutline
          || existingContainment?.outlineFloor !== containment.outlineFloor
        )) {
          throw new Error(`Block containment ${definition.type} does not match its existing definition`);
        }
      } else {
        disposers.push(extensions.own(registry.defineBlock(definition)));
      }
      // When the type is already defined (host or test helper), reuse it and only
      // attach React presentation. Object identity is no longer required because
      // core no longer ships a shared default-writing definition reference.

      disposers.push(renderers.register(definition.type, render));
      if (view) {
        disposers.push(views.register(definition.type, view));
      }
      if (registration.separatesBlockElements) {
        this.blockElementSeparatorTypes.add(definition.type);
        disposers.push(() => this.blockElementSeparatorTypes.delete(definition.type));
      }
      if (slashCommand) {
        disposers.push(slashCommands.register({
          ...slashCommand,
          id: slashCommand.id ?? `type.${definition.type}`,
          isAvailable: (context) => {
            const block = core.getBlock(context.blockId);
            return Boolean(
              block &&
              block.type !== definition.type &&
              slashCommand.isAvailable?.(context) !== false
            );
          },
          execute: ({ blockId }) => core.setBlockType(blockId, definition.type),
        }));
      }
    } catch (error) {
      disposers.reverse().forEach((dispose) => dispose());
      throw error;
    }

    let dispose: () => void = () => undefined;
    dispose = extensions.own(() => {
      if (this.registrations.get(definition.type) === dispose) {
        this.registrations.delete(definition.type);
      }
      disposers.reverse().forEach((dispose) => dispose());
    });
    this.registrations.set(definition.type, dispose);
    return dispose;
  }

  /**
   * Registers ordered defaults and optional semantic validation for list properties.
   *
   * @param registration - Stable registration ID plus defaults and validator.
   * @returns An idempotent disposer that removes the registration.
   * @throws {Error} When the ID is empty, duplicated, or registration occurs
   * outside active extension setup.
   */
  registerListProps(registration: ListPropsRegistration): () => void {
    this.reactEditor.extensions.assertActive();
    if (!registration.id) throw new Error("List property registration ID is required");
    if (this.listPropsRegistrations.some(({ id }) => id === registration.id)) {
      throw new Error(`List property registration ${registration.id} is already registered`);
    }
    this.listPropsRegistrations.push(registration);
    return this.reactEditor.extensions.own(() => {
      const index = this.listPropsRegistrations.indexOf(registration);
      if (index >= 0) this.listPropsRegistrations.splice(index, 1);
    });
  }

  /**
   * Reports whether a list-property extension is currently registered.
   *
   * @param id - Stable list-property registration ID.
   * @returns `true` when an active registration has the supplied ID.
   */
  hasListProps(id: string): boolean {
    return this.listPropsRegistrations.some((registration) => registration.id === id);
  }

  /**
   * Validates a complete list-property candidate with all active validators.
   *
   * Active defaults are merged for validation only; the candidate is not mutated.
   * Validators are accept/reject hooks and any exception counts as rejection.
   *
   * @param candidate - Opaque list-property record to validate.
   * @returns `true` when the value is portable and every validator accepts it.
   */
  validateListProps(candidate: BlockListProps): boolean {
    return this.isValid({ ...this.defaults(), ...candidate });
  }

  /**
   * Adds active list-property defaults recursively without overwriting caller values.
   *
   * @param input - Detached block input tree to prepare for React-owned insertion.
   * @returns A recursively copied input tree with registered defaults shallowly merged.
   */
  prepareBlock(input: EditorBlockInput): EditorBlockInput {
    return {
      ...input,
      listProps: { ...this.defaults(), ...input.listProps },
      children: input.children?.map((child) => this.prepareBlock(child)),
    };
  }

  /**
   * Inserts a recursively prepared and validated block through the core editor.
   *
   * @param input - Block subtree to receive active defaults and validation.
   * @param afterId - Sibling after which to insert, `null` for first position, or
   * omitted for the end of the root list.
   * @returns The stable identifier assigned to the inserted root block.
   * @throws {Error} When list properties are invalid or core insertion fails.
   */
  insertBlock(input: EditorBlockInput, afterId?: string | null): string {
    const prepared = this.prepareBlock(input);
    const validateTree = (block: EditorBlockInput): boolean => (
      this.isValid(block.listProps ?? {}) && (block.children ?? []).every(validateTree)
    );
    if (!validateTree(prepared)) throw new Error("Invalid block list properties");
    return this.editor.blocks.insertBlock(prepared, afterId);
  }

  /**
   * Applies one patch after React-owned list-property validation.
   *
   * @param id - Identifier of the block to update.
   * @param patch - Partial block fields to pass to the core manager.
   * @returns `true` when the patch is applied, or `false` when the block is
   * missing or its resulting list properties are invalid.
   */
  updateBlock(id: string, patch: EditorBlockPatch): boolean {
    const block = this.editor.blocks.getBlock(id);
    if (!block) return false;
    if (patch.listProps && !this.isValid({ ...this.defaults(), ...block.listProps, ...patch.listProps })) return false;
    this.editor.blocks.updateBlock(id, patch);
    return true;
  }

  /**
   * Filters invalid or missing entries and commits the accepted subset as one core batch.
   *
   * Duplicate block IDs are simulated in request order so later validation sees
   * earlier accepted list-property patches.
   *
   * @param updates - Ordered identified patches to validate and attempt.
   * @returns One positional result per requested update with applied or skipped status.
   * @throws {Error} When the accepted subset violates a non-list core invariant.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): BlockMutationResult {
    const accepted: EditorBlockUpdate[] = [];
    const simulated = new Map<string, BlockListProps>();
    const results = updates.map(({ id, patch }, index) => {
      const block = this.editor.blocks.getBlock(id);
      if (!block) return { index, id, status: "skipped" as const, reason: "missing" as const };
      const current = simulated.get(id) ?? block.listProps;
      const next = patch.listProps ? { ...current, ...patch.listProps } : current;
      if (patch.listProps && !this.isValid({ ...this.defaults(), ...next })) {
        return { index, id, status: "skipped" as const, reason: "invalid" as const };
      }
      simulated.set(id, next);
      accepted.push({ id, patch });
      return { index, id, status: "applied" as const };
    });
    if (accepted.length) this.editor.blocks.updateBlocks(accepted);
    return { results };
  }

  /**
   * Deletes selected list-property keys after validating the resulting record.
   *
   * @param id - Identifier of the block to modify.
   * @param keys - Property names to remove.
   * @returns `true` when deletion is applied, or `false` when the block is
   * missing or the resulting properties are invalid.
   */
  deleteListProps(id: string, keys: readonly string[]): boolean {
    const block = this.editor.blocks.getBlock(id);
    if (!block) return false;
    const next = { ...block.listProps };
    keys.forEach((key) => delete next[key]);
    if (!this.isValid({ ...this.defaults(), ...next })) return false;
    return this.editor.blocks.deleteListProps(id, keys);
  }

  /**
   * Deletes list-property keys from valid targets using best-effort filtering.
   *
   * @param updates - Blocks and property names requested for deletion.
   * @returns One positional result per request; missing and invalid entries are
   * skipped while accepted entries are committed together.
   */
  deleteListPropsBatch(updates: readonly { id: string; keys: readonly string[] }[]): BlockMutationResult {
    const accepted: Array<{ id: string; keys: readonly string[] }> = [];
    const simulated = new Map<string, BlockListProps>();
    const results = updates.map(({ id, keys }, index) => {
      const block = this.editor.blocks.getBlock(id);
      if (!block) return { index, id, status: "skipped" as const, reason: "missing" as const };
      const next = { ...(simulated.get(id) ?? block.listProps) };
      keys.forEach((key) => delete next[key]);
      if (!this.isValid({ ...this.defaults(), ...next })) {
        return { index, id, status: "skipped" as const, reason: "invalid" as const };
      }
      simulated.set(id, next);
      accepted.push({ id, keys });
      return { index, id, status: "applied" as const };
    });
    if (accepted.length) this.editor.blocks.deleteListPropsBatch(accepted);
    return { results };
  }

  /** @returns Current core block revision. */
  get revision(): number { return this.editor.blocks.revision; }

  /** @returns One detached block, when present. */
  getBlock(id: string): ReturnType<CoreBlockManager["getBlock"]> { return this.editor.blocks.getBlock(id); }

  /** @returns The complete detached root forest. */
  getBlocks(): ReturnType<CoreBlockManager["getBlocks"]> { return this.editor.blocks.getBlocks(); }

  /** @returns Ordered root block identifiers. */
  getRootIds(): string[] { return this.editor.blocks.getRootIds(); }

  /** Subscribes to one recursive block snapshot. */
  subscribeBlock(id: string, listener: () => void): () => void { return this.editor.blocks.subscribeBlock(id, listener); }

  /** Subscribes to ordered root identifiers. */
  subscribeRootIds(listener: () => void): () => void { return this.editor.blocks.subscribeRootIds(listener); }

  /** Subscribes to hierarchy changes. */
  subscribeStructure(listener: () => void): () => void { return this.editor.blocks.subscribeStructure(listener); }

  /** @returns Direct child identifiers for a block. */
  getChildIds(id: string): string[] { return this.editor.blocks.getChildIds(id); }

  /** @returns A block's parent, root marker, or missing marker. */
  getParentId(id: string): string | null | undefined { return this.editor.blocks.getParentId(id); }

  /** Imports a detached block forest with collision remapping. */
  importForest(...args: Parameters<CoreBlockManager["importForest"]>): ReturnType<CoreBlockManager["importForest"]> {
    return this.editor.blocks.importForest(...args);
  }

  /** Clears one block while preserving its identity. */
  clearBlock(id: string): void { this.editor.blocks.clearBlock(id); }

  /** Converts one block to a registered type. */
  setBlockType(id: string, type: string): void { this.editor.blocks.setBlockType(id, type); }

  /** Removes one block subtree. */
  removeBlock(id: string): void { this.editor.blocks.removeBlock(id); }

  /** Removes several block subtrees atomically. */
  removeBlocks(ids: readonly string[]): void { this.editor.blocks.removeBlocks([...ids]); }

  /** Merges source content and children into the target. */
  mergeBlocks(targetId: string, sourceId: string): number { return this.editor.blocks.mergeBlocks(targetId, sourceId); }

  /** Moves one block relative to a target. */
  moveBlock(...args: Parameters<CoreBlockManager["moveBlock"]>): void { this.editor.blocks.moveBlock(...args); }

  /** Moves several block roots as one group. */
  moveBlocks(...args: Parameters<CoreBlockManager["moveBlocks"]>): void { this.editor.blocks.moveBlocks(...args); }

  /** Indents one block when eligible. */
  indentBlock(id: string): void { this.editor.blocks.indentBlock(id); }

  /** Indents a block range when eligible. */
  indentBlocks(ids: readonly string[]): void { this.editor.blocks.indentBlocks([...ids]); }

  /** Outdents one block when eligible. */
  outdentBlock(id: string): void { this.editor.blocks.outdentBlock(id); }

  /** Outdents a block range when eligible. */
  outdentBlocks(ids: readonly string[]): void { this.editor.blocks.outdentBlocks([...ids]); }

  /** Sets one opaque block property. */
  setBlockProp(id: string, key: string, value: unknown): void { this.editor.blocks.setBlockProp(id, key, value); }

  /** Sets namespaced block plugin data. */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void {
    this.editor.blocks.setBlockPluginData(id, pluginId, value);
  }

  /** @returns A registered native block definition. */
  getDefinition(type: string): ReturnType<BlockRegistryManager["get"]> { return this.editor.blocksRegistry.get(type); }

  /** Validates native block properties through the core definition registry. */
  validateBlockProps(type: string, props: Record<string, unknown>): Record<string, unknown> {
    return this.editor.blocksRegistry.validate(type, props);
  }

  /**
   * Composes active defaults in extension registration order.
   *
   * @returns A new shallowly merged list-property record.
   */
  private defaults(): BlockListProps {
    return Object.assign({}, ...this.listPropsRegistrations.map(({ defaults }) => defaults ?? {}));
  }

  /**
   * Runs portability validation followed by every active semantic validator.
   *
   * @param candidate - Complete list-property record to inspect.
   * @returns `true` only when core portability and all React validators succeed.
   */
  private isValid(candidate: BlockListProps): boolean {
    try { validateBlockListProps(candidate); } catch { return false; }
    return this.listPropsRegistrations.every(({ validate }) => {
      if (!validate) return true;
      try { return validate(candidate); } catch { return false; }
    });
  }

  /**
   * Deletes one complete React block registration by persisted type.
   *
   * The core definition, renderer, and optional slash conversion are released
   * together in reverse registration order.
   *
   * @param type - Persisted block type registered through this manager.
   * @returns True when a complete registration existed and was disposed.
   */
  delete(type: string): boolean {
    this.reactEditor.extensions.assertActive();
    const dispose = this.registrations.get(type);
    if (!dispose) return false;
    dispose();
    return true;
  }

  /** @returns Whether this registered block type partitions root block elements. */
  separatesBlockElements(type: string): boolean {
    return this.blockElementSeparatorTypes.has(type);
  }

  /** @returns The first registered separator type used by automatic card creation. */
  getDefaultBlockElementSeparatorType(): string | undefined {
    return this.blockElementSeparatorTypes.values().next().value;
  }
}
