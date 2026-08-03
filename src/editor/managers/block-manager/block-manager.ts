import { BlockRegistry, type BlockDefinition } from "../../../blocks";
import type {
  CommandHandler,
  RegisteredCommand,
} from "../../../managers";
import type {
  BlockInput,
  BlockLayout,
  BlockPatch,
  BlockUpdate,
} from "../../../store/document-model";
import type {
  EditorBlock,
  EditorBlockInput,
  EditorBlockLayout,
  EditorBlockPatch,
  EditorBlockUpdate,
} from "../../model";
import type { EditorSelection, RivtoEditorApi } from "../../types";
import { commandPayload, commandString } from "../utils";
import type { RuntimeBlockSelection } from "./utils";

/**
 * Owns editor block definitions, commands, and typed block operations.
 *
 * Collaborative block state remains in DocumentModel. This manager composes a
 * public BlockRegistry for native definitions, validates command payloads, and
 * expands structural commands through the current local selection.
 */
export class BlockManager {
  /** Native block-definition registry intentionally nested under the manager. */
  readonly registry = new BlockRegistry();

  private readonly registrations: RegisteredCommand[] = [];
  private readonly removeDefinitions = new Set<() => void>();

  /**
   * Creates the public block manager and installs its built-in commands.
   *
   * @param editor - Owning editor interface providing document and runtime capabilities.
   */
  constructor(private readonly editor: RivtoEditorApi) {
    this.registerRequiredCommands();
  }

  /**
   * Resolves one placed block by its stable identifier.
   *
   * @param id - Persisted block identifier to resolve.
   * @returns Detached block subtree, or undefined when absent.
   */
  getBlock(id: string): EditorBlock | undefined {
    return this.editor.document.blocks.getBlock(id) satisfies EditorBlock | undefined;
  }

  /**
   * Materializes the complete ordered root block tree.
   *
   * @returns Detached root blocks with recursively materialized children.
   */
  getBlocks(): EditorBlock[] {
    return this.editor.document.blocks.getBlocks() satisfies EditorBlock[];
  }

  /**
   * Reads top-level block identifiers without materializing subtrees.
   *
   * @returns Root identifiers in collaborative order.
   */
  getRootIds(): string[] {
    return this.editor.document.blocks.getRootIds();
  }

  /**
   * Reads one block's direct child identifiers.
   *
   * @param id - Parent block identifier.
   * @returns Child identifiers in collaborative order, or an empty list when absent.
   */
  getChildIds(id: string): string[] {
    return this.editor.document.blocks.getChildIds(id);
  }

  /**
   * Resolves one block's current structural parent.
   *
   * @param id - Block identifier to locate.
   * @returns Parent identifier, null for a root, or undefined when absent.
   */
  getParentId(id: string): string | null | undefined {
    return this.editor.document.blocks.getParentId(id);
  }

  /**
   * Reads collapse-aware block identifiers in document order.
   *
   * @returns Visible identifiers in depth-first order.
   */
  getVisibleBlockIds(): string[] {
    return this.editor.document.blocks.getVisibleBlockIds();
  }

  /**
   * Inserts a validated block through the built-in command path.
   *
   * @param block - Native type and initial persisted values.
   * @param afterId - Sibling to follow, null to prepend, or undefined to append.
   * @returns Stable identifier assigned to the new block.
   */
  insertBlock(block: EditorBlockInput, afterId?: string | null): string {
    const command = { block, afterId } satisfies { block: BlockInput; afterId?: string | null };
    return this.editor.commands.execute("block.insert", command) as string;
  }

  /**
   * Applies supplied mutable fields to one block.
   *
   * @param id - Block identifier to update.
   * @param patch - Mutable fields to validate and apply.
   * @returns No value.
   */
  updateBlock(id: string, patch: EditorBlockPatch): void {
    const command = { id, patch } satisfies { id: string; patch: BlockPatch };
    this.editor.commands.execute("block.update", command);
  }

  /**
   * Applies several identified block patches as one command and undo item.
   *
   * @param updates - Ordered block identifiers and patches.
   * @returns No value.
   */
  updateBlocks(updates: readonly EditorBlockUpdate[]): void {
    const command = { updates } satisfies { updates: readonly BlockUpdate[] };
    this.editor.commands.execute("block.update-many", command);
  }

  /**
   * Clears content and descendants while preserving one block's identity.
   *
   * @param id - Block identifier to retain and clear.
   * @returns No value.
   */
  clearBlock(id: string): void {
    this.editor.commands.execute("block.clear", { id });
  }

  /**
   * Converts one block to another registered native type.
   *
   * @param id - Block identifier to convert.
   * @param type - Registered destination type.
   * @returns No value.
   */
  setBlockType(id: string, type: string): void {
    this.editor.commands.execute("block.type.set", { id, type });
  }

  /**
   * Removes a block subtree or its active structural selection.
   *
   * @param id - Block identifier anchoring removal.
   * @returns No value.
   */
  removeBlock(id: string): void {
    this.editor.commands.execute("block.remove", { id });
  }

  /**
   * Appends a source block's content and children into a surviving target.
   *
   * @param targetId - Block that remains after the merge.
   * @param sourceId - Block transferred and removed by the merge.
   * @returns Target content offset where source content begins.
   */
  mergeBlocks(targetId: string, sourceId: string): number {
    return this.editor.commands.execute("block.merge", { targetId, sourceId }) as number;
  }

  /**
   * Moves one block relative to a destination.
   *
   * @param id - Block identifier to move.
   * @param targetId - Destination, or null for the sibling-list start.
   * @param position - Placement before, after, or inside the destination.
   * @returns No value.
   */
  moveBlock(
    id: string,
    targetId: string | null,
    position: "before" | "after" | "inside" = "after",
  ): void {
    this.editor.commands.execute("block.move", { id, targetId, position });
  }

  /**
   * Moves several sibling subtree roots as one command and undo item.
   *
   * @param ids - Ordered block identifiers to move together.
   * @param targetId - Destination, or null for the sibling-list start.
   * @param position - Placement before, after, or inside the destination.
   * @returns No value.
   */
  moveBlocks(
    ids: string[],
    targetId: string | null,
    position: "before" | "after" | "inside" = "after",
  ): void {
    this.editor.commands.execute("block.move-many", { ids, targetId, position });
  }

  /**
   * Nests a block or eligible structural selection under a previous sibling.
   *
   * @param id - Block identifier anchoring indentation.
   * @returns No value.
   */
  indentBlock(id: string): void {
    this.editor.commands.execute("block.indent", { id });
  }

  /**
   * Moves a block or eligible structural selection out of its parent.
   *
   * @param id - Block identifier anchoring outdentation.
   * @returns No value.
   */
  outdentBlock(id: string): void {
    this.editor.commands.execute("block.outdent", { id });
  }

  /**
   * Sets or removes one validated native block property.
   *
   * @param id - Owning block identifier.
   * @param key - Native property key.
   * @param value - Portable value, or undefined to remove the property.
   * @returns No value.
   */
  setBlockProp(id: string, key: string, value: unknown): void {
    this.editor.commands.execute("block.prop.set", { id, key, value });
  }

  /**
   * Sets or removes one block plugin-data namespace.
   *
   * @param id - Owning block identifier.
   * @param pluginId - Stable plugin namespace.
   * @param value - Portable value, or undefined to remove the namespace.
   * @returns No value.
   */
  setBlockPluginData(id: string, pluginId: string, value: unknown): void {
    this.editor.commands.execute("block.pluginData.set", { id, pluginId, value });
  }

  /**
   * Patches collaborative geometry fields on one block.
   *
   * @param id - Block identifier whose layout should change.
   * @param layout - Geometry fields to update.
   * @returns No value.
   */
  setBlockLayout(id: string, layout: Partial<EditorBlockLayout>): void {
    const command = { id, layout } satisfies { id: string; layout: Partial<BlockLayout> };
    this.editor.commands.execute("block.layout.set", command);
  }

  /**
   * Registers one native block definition for this editor instance.
   *
   * @param definition - Definition for a unique, non-empty native type.
   * @returns Idempotent disposer that removes this exact definition.
   */
  defineBlock(definition: BlockDefinition): () => void {
    const unregister = this.registry.register(definition);
    let active = true;
    const dispose = (): void => {
      if (!active) return;
      active = false;
      unregister();
      this.removeDefinitions.delete(dispose);
      this.editor.notifyChanged();
    };
    this.removeDefinitions.add(dispose);
    this.editor.notifyChanged();
    return dispose;
  }

  /**
   * Releases built-in commands and manager-owned block definitions.
   *
   * @returns No value.
   */
  destroy(): void {
    [...this.removeDefinitions].reverse().forEach((dispose) => dispose());
    this.registrations.splice(0).reverse().forEach((registration) => registration.dispose());
  }

  /**
   * Registers every block command required by the public manager API.
   *
   * Document mutations execute through the editor's batching boundary so each
   * command has one CRDT transaction and undo item unless an outer batch exists.
   *
   * @returns No value.
   */
  private registerRequiredCommands(): void {
    const documentCommand = (handler: CommandHandler): CommandHandler => (value) =>
      this.editor.batchUpdates(() => handler(value));
    const register = (name: string, handler: CommandHandler): void => {
      this.registrations.push(this.editor.commands.register(name, handler));
    };

    register("block.insert", documentCommand((value) => {
      const data = commandPayload(value);
      const block = commandPayload(data.block) as unknown as BlockInput;
      if (typeof block.type !== "string") throw new Error("block.type must be a string");
      const definition = this.registry.get(block.type);
      if (!definition) throw new Error(`Block type ${block.type} is unavailable in ${this.editor.mode.get()} mode`);
      const afterId = data.afterId === undefined
        ? undefined
        : data.afterId === null ? null : commandString(data.afterId, "afterId");
      return this.editor.document.blocks.insertBlock(this.registry.prepare(block), afterId);
    }));
    register("block.update", (value) => {
      const data = commandPayload(value);
      this.editor.document.blocks.updateBlock(commandString(data.id, "id"), commandPayload(data.patch) as BlockPatch);
    });
    register("block.update-many", documentCommand((value) => {
      const data = commandPayload(value);
      if (!Array.isArray(data.updates)) throw new Error("updates must be an array");
      this.editor.document.blocks.updateBlocks(data.updates.map((item) => {
        const update = commandPayload(item);
        return {
          id: commandString(update.id, "id"),
          patch: commandPayload(update.patch) as BlockPatch,
        };
      }));
    }));
    register("block.clear", documentCommand((value) => {
      const id = commandString(commandPayload(value).id, "id");
      this.editor.document.transact(() => {
        this.editor.document.blocks.updateBlock(id, { content: "" });
        this.editor.document.blocks.getChildIds(id).forEach((childId) => this.editor.document.blocks.removeBlock(childId));
      });
    }));
    register("block.type.set", documentCommand((value) => {
      const data = commandPayload(value);
      const id = commandString(data.id, "id");
      const type = commandString(data.type, "type");
      const prepared = this.registry.prepare({ type });
      this.editor.document.blocks.setBlockType(id, type, prepared.props);
    }));
    register("block.remove", documentCommand((value) => {
      const data = commandPayload(value);
      this.editor.document.transact(() => {
        this.selectedBlockIds(commandString(data.id, "id")).forEach((id) => this.editor.document.blocks.removeBlock(id));
      });
    }));
    register("block.merge", documentCommand((value) => {
      const data = commandPayload(value);
      return this.editor.document.blocks.mergeBlocks(
        commandString(data.targetId, "targetId"),
        commandString(data.sourceId, "sourceId"),
      );
    }));
    register("block.move", documentCommand((value) => {
      const data = commandPayload(value);
      const rawTarget = "targetId" in data ? data.targetId : data.afterId;
      this.editor.document.blocks.moveBlock(
        commandString(data.id, "id"),
        rawTarget === null ? null : commandString(rawTarget, "targetId"),
        data.position === "before" || data.position === "inside" ? data.position : "after",
      );
    }));
    register("block.move-many", documentCommand((value) => {
      const data = commandPayload(value);
      if (!Array.isArray(data.ids) || data.ids.some((id) => typeof id !== "string")) {
        throw new Error("ids must be an array of strings");
      }
      const targetId = data.targetId === null ? null : commandString(data.targetId, "targetId");
      const position = data.position === "before" || data.position === "inside" ? data.position : "after";
      this.editor.document.blocks.moveBlocks(data.ids, targetId, position);
    }));
    register("block.indent", documentCommand((value) => {
      const before = this.editor.selection.get();
      const ids = this.selectedStructuralBlockIds(commandString(commandPayload(value).id, "id"));
      this.editor.document.blocks.indentBlocks(ids);
      this.restoreBlockSelection(before, ids);
    }));
    register("block.outdent", documentCommand((value) => {
      const before = this.editor.selection.get();
      const ids = this.selectedStructuralBlockIds(commandString(commandPayload(value).id, "id"));
      this.editor.document.blocks.outdentBlocks(ids);
      this.restoreBlockSelection(before, ids);
    }));
    register("block.prop.set", documentCommand((value) => {
      const data = commandPayload(value);
      this.editor.document.blocks.setBlockProp(commandString(data.id, "id"), commandString(data.key, "key"), data.value);
    }));
    register("block.pluginData.set", documentCommand((value) => {
      const data = commandPayload(value);
      this.editor.document.blocks.setPluginData(
        commandString(data.id, "id"),
        commandString(data.pluginId, "pluginId"),
        data.value,
      );
    }));
    register("block.layout.set", documentCommand((value) => {
      const data = commandPayload(value);
      this.editor.document.blocks.setBlockLayout(commandString(data.id, "id"), commandPayload(data.layout) as Partial<BlockLayout>);
    }));
  }

  /**
   * Expands removal to an active block selection containing the target.
   *
   * @param id - Block identifier anchoring the operation.
   * @returns Selected identifiers, or only the supplied identifier.
   */
  private selectedBlockIds(id: string): string[] {
    const selection = this.editor.selection.get().find((item) => item.type === "block" && item.blockIds.includes(id));
    return selection?.type === "block" ? selection.blockIds : [id];
  }

  /**
   * Expands a structural command to the normalized active range.
   *
   * @param id - Block identifier anchoring the operation.
   * @returns Normalized selected identifiers, or only the supplied identifier.
   */
  private selectedStructuralBlockIds(id: string): string[] {
    const range = this.editor.selection.normalize();
    return range?.blocks.some((block) => block.id === id)
      ? range.blocks.map((block) => block.id)
      : [id];
  }

  /**
   * Restores a structural selection after its blocks move in the tree.
   *
   * @param previous - Selection captured before the structural mutation.
   * @param ids - Identifiers participating in the mutation.
   * @returns No value.
   */
  private restoreBlockSelection(previous: EditorSelection, ids: string[]): void {
    const index = previous.findIndex((item) =>
      item.type === "block" && ids.some((id) => item.blockIds.includes(id)),
    );
    const blockSelection = previous[index];
    if (blockSelection?.type !== "block") return;

    const remaining = blockSelection.blockIds.filter((id) => this.getBlock(id));
    if (!remaining.length) {
      this.editor.selection.set(previous.filter((_, itemIndex) => itemIndex !== index));
      return;
    }
    const anchorBlockId = remaining.includes(blockSelection.anchorBlockId)
      ? blockSelection.anchorBlockId
      : remaining[0]!;
    const focusBlockId = remaining.includes(blockSelection.focusBlockId)
      ? blockSelection.focusBlockId
      : remaining.at(-1)!;
    const restored = {
      type: "block",
      blockIds: remaining,
      anchorBlockId,
      focusBlockId,
    } satisfies RuntimeBlockSelection;
    this.editor.selection.set(previous.map((item, itemIndex) => itemIndex === index ? restored : item));
  }
}
