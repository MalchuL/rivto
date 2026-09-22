/**
 * Owns atomic React block-type registration and presentation metadata.
 *
 * Definitions remain stored in the core registry; this manager coordinates
 * their renderer, optional view, slash conversion, and separator metadata.
 */
import type { BlockRegistryManager, RivtoEditorApi } from "@chulane/rivto";
import type { BlockTypesCapability } from "../../capabilities";
import type { ReactEditorImpl } from "../../react-editor";
import { getBlockContainment, type ReactBlockRegistration } from "./types";

/** Coordinates one block type's core definition and React presentation. */
export class BlockTypeManager implements BlockTypesCapability {
  private readonly registrations = new Map<string, () => void>();
  private readonly blockElementSeparatorTypes = new Set<string>();

  /**
   * Creates the block-type registration manager.
   * @param reactEditor - Owning React runtime providing presentation managers.
   * @param editor - Core runtime providing definitions and block mutations.
   */
  constructor(
    private readonly reactEditor: ReactEditorImpl,
    private readonly editor: RivtoEditorApi,
  ) {}

  /**
   * Registers definition, renderer, optional view, and type conversion atomically.
   * @param registration - Complete custom block integration.
   * @returns Idempotent disposer releasing every installed part in reverse.
   * @throws On definition, renderer, view, or slash-command conflicts.
   */
  register(registration: ReactBlockRegistration): () => void {
    const { blocks: core, blockRegistry: registry } = this.editor;
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

      disposers.push(renderers.register(definition.type, render));
      if (view) disposers.push(views.register(definition.type, view));
      if (registration.separatesBlockElements) {
        this.blockElementSeparatorTypes.add(definition.type);
        disposers.push(() => this.blockElementSeparatorTypes.delete(definition.type));
      }
      if (slashCommand) {
        disposers.push(slashCommands.register({
          ...slashCommand,
          id: slashCommand.id ?? `type.${definition.type}`,
          isAvailable: (context) => {
            const block = core.getBlockNode(context.blockId);
            return Boolean(
              block
              && block.type !== definition.type
              && slashCommand.isAvailable?.(context) !== false
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
   * Deletes one complete React block registration by persisted type.
   * @param type - Persisted block type registered through this manager.
   * @returns Whether a complete registration existed and was disposed.
   */
  delete(type: string): boolean {
    this.reactEditor.extensions.assertActive();
    const dispose = this.registrations.get(type);
    if (!dispose) return false;
    dispose();
    return true;
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
