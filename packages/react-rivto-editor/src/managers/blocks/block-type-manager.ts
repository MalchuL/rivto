import type { RegistrationOwner } from "../extensions/types";
import type { BlockRegistryManager, DocumentEditorAPI } from "@chulane/rivto";
import type { ReactEditorApi } from "../../editor/types";
import type { BlockTypesApi } from "./block-types-api";
import type { ReactBlockRegistration } from "./types";

/**
 * Owns atomic React block-type registration and presentation metadata.
 *
 * Coordinates each type's core definition and React presentation. Definitions
 * remain stored in the core registry; this manager installs their renderer,
 * optional behavior, slash conversion, and separator metadata. A registration
 * owns its complete definition, including metadata, until its disposer runs.
 */
export class BlockTypeManager implements BlockTypesApi {
  private readonly registrations = new Map<string, () => void>();
  private readonly blockElementSeparatorTypes = new Set<string>();
  private readonly subscriptions = new Set<() => void>();

  /**
   * Creates the block-type registration manager.
   *
   * Complete definitions, including metadata, are stored in the core registry.
   * Subscription cleanup is registered before block integrations, so observers
   * receive their teardown notifications before this manager disconnects them.
   *
   * @param reactEditor - Owning React runtime providing presentation managers.
   * @param editor - Core runtime providing definitions and block mutations.
   * @param extensions - Internal registration ownership and destruction guard.
   */
  constructor(
    private readonly reactEditor: ReactEditorApi,
    private readonly editor: DocumentEditorAPI,
    private readonly extensions: RegistrationOwner,
  ) {
    extensions.registerCleanup(() => this.releaseRegistration([...this.subscriptions]));
  }

  /**
   * Registers definition, renderer, optional behavior, and type conversion atomically.
   *
   * The complete definition and its metadata are registered as supplied, without
   * copying or merging annotations. A type already present in the core registry
   * is a conflict, including a definition installed by another React runtime.
   * Cleanup removes this registration's definition together with its presentation.
   * Every installed part is released even when an earlier cleanup fails; errors
   * are reported only after the remaining releases finish.
   *
   * @param registration - Complete custom block integration.
   * @returns Idempotent disposer releasing every installed part in reverse.
   * @throws On invalid definitions or renderer/slash-command conflicts; installed resources roll back on any failure.
   * Cleanup rethrows a single failure or aggregates multiple failures after releasing all parts.
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
      disposers.push(this.editor.blockRegistry.defineBlock(definition));
      disposers.push(renderers.register(definition.type, render, registration.layout));
      if (registration.clipboard) {
        disposers.push(
          this.reactEditor.clipboard.registerBlockConverter(
            definition.type,
            registration.clipboard,
          ),
        );
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
      this.releaseRegistration(disposers, [error]);
    }

    let dispose: () => void = () => undefined;
    dispose = extensions.registerCleanup(() => {
      if (this.registrations.get(definition.type) === dispose) {
        this.registrations.delete(definition.type);
      }
      this.releaseRegistration(disposers);
    });
    this.registrations.set(definition.type, dispose);
    return dispose;
  }

  /**
   * Deletes one complete React block registration by persisted type.
   * @param type - Persisted block type registered through this manager.
   * @returns Whether a complete registration existed and was disposed.
   * @throws If the runtime is destroyed or cleanup fails; all registration releases
   * run before cleanup failures are rethrown, with multiple failures aggregated.
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
   * Observes creation and removal of complete core block definitions.
   *
   * Metadata arrives with each definition, so core lifecycle notifications also
   * update annotation readers. No block-document subscription is created.
   * This manager releases its own listeners after block-registration teardown when
   * its React runtime is destroyed; listeners belonging to other presentations
   * remain subscribed.
   *
   * @param listener - Callback invoked when a complete definition is registered or removed.
   * @returns Idempotent cleanup removing this subscription before automatic teardown.
   * @throws If the React runtime has started destruction.
   */
  subscribe(listener: () => void): () => void {
    this.extensions.assertActive();
    /**
     * Notifies this subscriber with an identity distinct from other subscriptions.
     *
     * The core registry deduplicates callbacks by identity. Wrapping the caller keeps
     * this presentation's cleanup from disconnecting the same callback elsewhere.
     *
     * @returns After notifying the subscriber.
     * @throws If the subscriber throws.
     */
    const notify = () => listener();
    const releaseDefinitions = this.editor.blockRegistry.subscribe(notify);
    /**
     * Disconnects this subscription and removes its retained cleanup.
     *
     * @returns After releasing the core definition listener; repeated calls do nothing.
     */
    const unsubscribe = () => {
      if (!this.subscriptions.delete(unsubscribe)) {
        return;
      }
      releaseDefinitions();
    };
    this.subscriptions.add(unsubscribe);
    return unsubscribe;
  }

  /**
   * Reads the current core definition with the metadata supplied by its registration.
   *
   * @param type - Persisted block type.
   * @returns Stable registered definition, or undefined for an unknown type.
   */
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

  /**
   * Releases every installed part in reverse order before reporting failures.
   *
   * Consuming the disposer list prevents already released parts from running again.
   * Rollback includes its original setup error alongside any cleanup failures.
   *
   * @param disposers - Owned registration releases, consumed by this call.
   * @param errors - Earlier setup failures; defaults to an empty collection.
   * @returns After every release succeeds when no earlier failure was supplied.
   * @throws The sole failure, or an AggregateError containing every failure.
   */
  private releaseRegistration(disposers: Array<() => void>, errors: unknown[] = []): void {
    for (const dispose of disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length === 1) {
      throw errors[0];
    }
    if (errors.length > 1) {
      throw new AggregateError(errors, "Block registration cleanup failed");
    }
  }
}
