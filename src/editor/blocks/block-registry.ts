import type { BlockInput } from "../../store/document-model";
import type { ComponentType } from "react";
import type { EditorMode } from "../editor/types";
import type { BlockDefinition, BlockRenderProps } from "./block-definition";

/** True only for mergeable records; arrays and class instances are values. */
const isRecord = (value: unknown): value is Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as object | null;
  // Checking the prototype chain, rather than identity with this realm's
  // Object.prototype, also recognizes records cloned across test/worker realms.
  return prototype === null || Object.getPrototypeOf(prototype) === null;
};

/**
 * Recursively overlays caller properties without sharing nested defaults.
 *
 * Only plain objects merge. Arrays and other values are intentional leaves and
 * are replaced as a whole, which avoids surprising index-by-index merging.
 */
const mergeProps = (defaults: Record<string, unknown>, input: Record<string, unknown>): Record<string, unknown> => {
  const result: Record<string, unknown> = structuredClone(defaults);
  for (const [key, value] of Object.entries(input)) {
    result[key] = isRecord(result[key]) && isRecord(value)
      ? mergeProps(result[key], value)
      : value;
  }
  return result;
};

/**
 * Owns the runtime mapping from persisted native types to block definitions.
 *
 * The registry does not read documents or render UI. It only validates type
 * ownership and prepares editor-level creation data.
 */
export class BlockRegistry {
  // Block name to definition
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
   * Resolves a mode-specific or shared renderer.
   *
   * A function is the shared shorthand; an object requires an explicit entry
   * for the requested mode. Supported blocks without a custom renderer fall
   * back to Rivto's default content presentation.
   */
  getRenderer(type: string, mode: EditorMode): ComponentType<BlockRenderProps> | undefined {
    const definition = this.get(type);
    if (!definition?.render) return undefined;
    return typeof definition.render === "function" ? definition.render : definition.render[mode];
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
    const props = mergeProps(definition.defaultProps ?? {}, input.props ?? {});
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
