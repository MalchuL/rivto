import type { ReactEditorImpl } from "../../react-editor";
import type { BlocksCapability } from "../../capabilities";
import type { ReactBlockRegistration } from "./block-types";
import type {
  BlockListProps,
  EditorBlockInput,
  EditorBlockPatch,
  EditorBlockUpdate,
} from "@chulane/rivto";
import { validateBlockListProps } from "@chulane/rivto";
import type { BlockMutationResult, ListPropsRegistration } from "./block-types";

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
   * @param reactEditor - Complete owning runtime. Core commands, renderers,
   * slash commands, and registration ownership are resolved lazily from it.
   */
  constructor(private readonly reactEditor: ReactEditorImpl) {}

  /**
   * Registers definition, renderer, and optional type conversion as one unit.
   *
   * @param registration - Complete custom block integration.
   * @returns Idempotent disposer releasing every installed part in reverse.
   * @throws On definition, renderer, or slash-command conflicts.
   */
  register(registration: ReactBlockRegistration): () => void {
    const { editor, extensions, renderers, slashCommands } = this.reactEditor;
    extensions.assertActive();
    const { definition, render, slashCommand } = registration;
    if (renderers.has(definition.type)) {
      throw new Error(`Block renderer ${definition.type} is already registered`);
    }

    const disposers: Array<() => void> = [];
    try {
      const existing = editor.blocksRegistry.get(definition.type);
      if (!existing) {
        disposers.push(extensions.own(editor.blocksRegistry.defineBlock(definition)));
      }
      // When the type is already defined (host or test helper), reuse it and only
      // attach React presentation. Object identity is no longer required because
      // core no longer ships a shared default-writing definition reference.

      disposers.push(renderers.register(definition.type, render));
      if (registration.separatesBlockElements) {
        this.blockElementSeparatorTypes.add(definition.type);
        disposers.push(() => this.blockElementSeparatorTypes.delete(definition.type));
      }
      if (slashCommand) {
        disposers.push(slashCommands.register({
          ...slashCommand,
          id: slashCommand.id ?? `type.${definition.type}`,
          isAvailable: (context) => {
            const block = editor.blocks.getBlock(context.blockId);
            return Boolean(
              block &&
              block.type !== definition.type &&
              slashCommand.isAvailable?.(context) !== false
            );
          },
          execute: ({ blockId }) => editor.blocks.setBlockType(blockId, definition.type),
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
    return this.reactEditor.editor.blocks.insertBlock(prepared, afterId);
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
    const block = this.reactEditor.editor.blocks.getBlock(id);
    if (!block) return false;
    if (patch.listProps && !this.isValid({ ...this.defaults(), ...block.listProps, ...patch.listProps })) return false;
    this.reactEditor.editor.blocks.updateBlock(id, patch);
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
      const block = this.reactEditor.editor.blocks.getBlock(id);
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
    if (accepted.length) this.reactEditor.editor.blocks.updateBlocks(accepted);
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
    const block = this.reactEditor.editor.blocks.getBlock(id);
    if (!block) return false;
    const next = { ...block.listProps };
    keys.forEach((key) => delete next[key]);
    if (!this.isValid({ ...this.defaults(), ...next })) return false;
    return this.reactEditor.editor.document.blocks.deleteListProps(id, keys);
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
      const block = this.reactEditor.editor.blocks.getBlock(id);
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
    if (accepted.length) this.reactEditor.editor.document.blocks.deleteListPropsBatch(accepted);
    return { results };
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
