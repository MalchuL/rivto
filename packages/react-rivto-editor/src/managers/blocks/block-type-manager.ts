import type { BlockDragOptions } from "../../extensions/block-drag/block-drag-options";
import type { RegistrationOwner } from "../extensions/types";
/**
 * Owns atomic React block-type registration and presentation metadata.
 *
 * Definitions remain stored in the core registry; this manager coordinates
 * their renderer, optional behavior, slash conversion, and separator metadata.
 */
import type { BlockRegistryManager, DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";
import type { BlockTypesApi } from "./block-types-api";
import { getBlockContainment, type ReactBlockRegistration } from "./types";

/** Coordinates one block type's core definition and React presentation. */
export class BlockTypeManager implements BlockTypesApi {
  private readonly dragOptions = new Map<string, BlockDragOptions>();
  private readonly registrations = new Map<string, () => void>();
  private readonly blockElementSeparatorTypes = new Set<string>();

  /**
   * Creates the block-type registration manager.
   * @param reactEditor - Owning React runtime providing presentation managers.
   * @param editor - Core runtime providing definitions and block mutations.
   * @param extensions - Internal registration ownership and destruction guard.
   */
  constructor(
    private readonly reactEditor: ReactEditorApi,
    private readonly editor: DocumentEditorAPI,
    private readonly extensions: RegistrationOwner,
  ) {}

  /**
   * Registers definition, renderer, optional behavior, and type conversion atomically.
   * @param registration - Complete custom block integration.
   * @returns Idempotent disposer releasing every installed part in reverse.
   * @throws On invalid definitions or renderer/slash-command conflicts; installed resources roll back on any failure.
   */
  register(registration: ReactBlockRegistration): () => void {
    const { renderers, slashCommands, blockBehaviors } = this.reactEditor;
    const extensions = this.extensions;
    extensions.assertActive();
    const { definition, render, slashCommand, behavior } = registration;
    if (renderers.has(definition.type)) {
      throw new Error(`Block renderer ${definition.type} is already registered`);
    }

    const disposers: Array<() => void> = [];
    try {
      const existing = this.editor.blockRegistry.get(definition.type);
      if (existing) {
        const containment = getBlockContainment(definition);
        const previous = getBlockContainment(existing);
        if (
          containment &&
          (previous?.childOutline !== containment.childOutline ||
            previous?.outlineFloor !== containment.outlineFloor)
        ) {
          throw new Error(
            `Block containment ${definition.type} does not match its existing definition`,
          );
        }
      } else {
        disposers.push(this.editor.blockRegistry.defineBlock(definition));
      }
      disposers.push(renderers.register(definition.type, render));
      if (registration.clipboard) {
        disposers.push(
          this.reactEditor.clipboard.registerBlockConverter(
            definition.type,
            registration.clipboard,
          ),
        );
      }
      if (registration.drag) {
        this.dragOptions.set(definition.type, registration.drag);
        disposers.push(() => this.dragOptions.delete(definition.type));
      }
      if (behavior) {
        disposers.push(blockBehaviors.register(behavior));
      }
      if (registration.separatesBlockElements) {
        this.blockElementSeparatorTypes.add(definition.type);
        disposers.push(() => this.blockElementSeparatorTypes.delete(definition.type));
      }
      if (slashCommand) {
        disposers.push(
          slashCommands.register({
            ...slashCommand,
            id: slashCommand.id ?? `type.${definition.type}`,
            isAvailable: (context) => {
              const block = context.reactPanel.blocks.getBlockNode(context.blockId);
              return Boolean(
                block &&
                block.type !== definition.type &&
                slashCommand.isAvailable?.(context) !== false,
              );
            },
            execute: ({ blockId, reactPanel }) =>
              reactPanel.blocks.setBlockType(blockId, definition.type),
          }),
        );
      }
    } catch (error) {
      disposers.reverse().forEach((dispose) => dispose());
      throw error;
    }

    let dispose: () => void = () => undefined;
    dispose = extensions.registerCleanup(() => {
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
   * @param type - Persisted block type registered through this manager.
   * @returns Whether a complete registration existed and was disposed.
   */
  delete(type: string): boolean {
    this.extensions.assertActive();
    const dispose = this.registrations.get(type);
    if (!dispose) {
      return false;
    }
    dispose();
    return true;
  }

  /**
   * Reads optional geometry without enabling the drag extension.
   * @param type - Persisted native block type.
   * @returns Its registered drag options, or undefined when none were supplied.
   */
  getDragOptions(type: string): BlockDragOptions | undefined {
    return this.dragOptions.get(type);
  }

  /** @param type - Persisted block type. @returns Its registered core definition. */
  getDefinition(type: string): ReturnType<BlockRegistryManager["get"]> {
    return this.editor.blockRegistry.get(type);
  }

  /**
   * Validates native properties through the core definition registry.
   * @param type - Persisted block type.
   * @param props - Candidate native properties.
   * @returns Validated properties.
   */
  validateBlockProps(type: string, props: Record<string, unknown>): Record<string, unknown> {
    return this.editor.blockRegistry.validate(type, props);
  }

  /** @param type - Persisted block type. @returns Whether it partitions root block elements. */
  separatesBlockElements(type: string): boolean {
    return this.blockElementSeparatorTypes.has(type);
  }

  /** @returns First registered separator type used by automatic card creation. */
  getDefaultBlockElementSeparatorType(): string | undefined {
    return this.blockElementSeparatorTypes.values().next().value;
  }
}
