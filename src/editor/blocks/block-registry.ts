import type { BlockInput } from "../../store/document-model";
import type { BlockDefinition, SlashItem } from "./block-definition";

/**
 * Owns the runtime mapping from persisted native types to block definitions.
 *
 * The registry does not read documents or render UI. It only validates type
 * ownership and prepares editor-level creation data.
 */
export class BlockRegistry {
  private readonly definitions = new Map<string, BlockDefinition>();

  /** Creates an empty block-definition registry. */
  constructor() {}

  /**
   * Registers one definition until the returned disposer is called.
   *
   * @param definition - Definition for a unique, non-empty native type.
   * @returns Idempotent function that unregisters this exact definition.
   * @throws If the type is empty or already registered.
   */
  register(definition: BlockDefinition): () => void {
    if (!definition.type) throw new Error("Block definition type is required");
    if (this.definitions.has(definition.type)) throw new Error(`Block type ${definition.type} is already registered`);
    this.definitions.set(definition.type, definition);
    return () => {
      if (this.definitions.get(definition.type) === definition) this.definitions.delete(definition.type);
    };
  }

  /**
   * Resolves a registered definition without inventing a fallback type.
   *
   * @param type - Persisted native type to resolve.
   * @returns Its definition, or `undefined` for a losslessly stored unknown type.
   */
  get(type: string): BlockDefinition | undefined {
    return this.definitions.get(type);
  }

  /**
   * Reports whether a native type is available for editor-level creation.
   *
   * @param type - Native type to inspect.
   * @returns `true` when a definition is registered.
   */
  has(type: string): boolean {
    return this.definitions.has(type);
  }

  /**
   * Applies definition defaults and validates creation properties.
   *
   * @param input - Caller-owned creation data containing a registered type.
   * @returns Detached input safe to pass to DocumentModelImpl.
   * @throws If the type is unknown or its property schema rejects the data.
   */
  prepare(input: BlockInput): BlockInput {
    const definition = this.require(input.type);
    const props = { ...definition.defaultProps, ...input.props };
    return { ...input, props: definition.propSchema?.parse(props) ?? props };
  }

  /**
   * Validates a complete property object for a stored block.
   *
   * Unknown types pass through unchanged so documents remain recoverable when
   * an optional plugin is not installed.
   *
   * @param type - Persisted native block type.
   * @param props - Complete candidate property object.
   * @returns Validated properties or the original unknown-type properties.
   */
  validate(type: string, props: Record<string, unknown>): Record<string, unknown> {
    return this.get(type)?.propSchema?.parse(props) ?? props;
  }

  /**
   * Builds slash-menu entries from registered block definitions.
   *
   * @returns Fresh menu values safe for consumers to sort or filter.
   */
  getSlashItems(): SlashItem[] {
    return [...this.definitions.values()].flatMap((definition) => definition.slash
      ? [{ ...definition.slash, block: { type: definition.type } }]
      : []);
  }

  /**
   * Resolves a definition required for creation.
   *
   * @param type - Native type that must be registered.
   * @returns Registered definition.
   * @throws If no definition owns the type.
   */
  private require(type: string): BlockDefinition {
    const definition = this.get(type);
    if (!definition) throw new Error(`Unknown block type ${type}`);
    return definition;
  }
}
