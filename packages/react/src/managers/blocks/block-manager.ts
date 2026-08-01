import type { ReactEditorImpl } from "../../react-editor";
import type { ReactBlockRegistration } from "./block-types";

/**
 * Atomically connects a core block definition to React presentation.
 *
 * The manager coordinates existing core definitions, RendererManager, and the
 * shared slash registry without becoming another block-data store.
 */
export class BlockManager {
  private readonly registrations = new Map<string, () => void>();

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
      const existing = editor.blocks.get(definition.type);
      if (!existing) {
        disposers.push(extensions.own(editor.defineBlock(definition)));
      } else if (existing !== definition) {
        throw new Error(`Block type ${definition.type} is already registered`);
      }

      disposers.push(renderers.register(definition.type, render));
      if (slashCommand) {
        disposers.push(slashCommands.register({
          ...slashCommand,
          id: slashCommand.id ?? `type.${definition.type}`,
          isAvailable: (context) => {
            const block = editor.getBlock(context.blockId);
            return Boolean(
              block &&
              block.type !== definition.type &&
              slashCommand.isAvailable?.(context) !== false
            );
          },
          execute: ({ blockId }) => editor.setBlockType(blockId, definition.type),
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
}
