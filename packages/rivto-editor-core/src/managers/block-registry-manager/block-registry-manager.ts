import type { BlockDefinition } from "../../blocks/types";
import type { EditorBlockInput } from "../../editor/model";
import { Listeners } from "../../utils";
import type { ZodType } from "zod";

/**
 * Determines whether a value can participate in recursive property merging.
 *
 * Arrays, primitives, and class instances are treated as complete leaf values.
 * Plain records from the current realm, another realm, or a null-prototype
 * object are safe to merge by key.
 *
 * @param value - Unknown property value to inspect.
 * @returns `true` when the value is a mergeable plain record.
 */
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
 *
 * @param defaults - Registered default properties used as the detached base.
 * @param input - Caller properties that override or extend the defaults.
 * @returns A detached recursively merged property record.
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
 * Validates complete block properties when a definition supplies a schema.
 *
 * Object schemas validate their declared fields while preserving additional
 * extension-owned properties. Unknown or schema-less definitions preserve all
 * properties unchanged so documents remain readable without every optional
 * block extension installed.
 *
 * @param definition - Registered definition, or undefined for an unknown type.
 * @param props - Complete candidate properties to validate.
 * @returns Schema output when available, otherwise the original properties.
 */
const validateProps = (
  definition: BlockDefinition | undefined,
  props: Record<string, unknown>,
): Record<string, unknown> => {
  const schema = definition?.propSchema as (ZodType<Record<string, unknown>> & {
    loose?: () => ZodType<Record<string, unknown>>;
  }) | undefined;
  return schema ? (schema.loose?.() ?? schema).parse(props) : props;
};

/**
 * Owns the runtime mapping from persisted native types to block definitions.
 *
 * The manager does not render UI or mutate document blocks. It validates type
 * ownership, prepares editor-level creation data, and publishes definition
 * lifecycle changes to its own subscribers.
 */
export class BlockRegistryManager {
  // Block name to definition
  private readonly definitions = new Map<string, BlockDefinition>();

  /** Definition disposers retained for deterministic editor teardown. */
  private readonly removeDefinitions = new Set<() => void>();
  /** Named subscribers notified after registry lifecycle changes. */
  private readonly listeners = new Listeners<{ blockRegistryChanged: void }>();

  /** Creates an empty block-definition registry manager. */
  constructor() {}

  /**
   * Defines one native block type until the returned disposer is called.
   *
   * @param definition - Definition for a unique, non-empty native type.
   * @returns Idempotent function that unregisters this exact definition.
   * @throws If the type is empty or already registered.
   */
  defineBlock(definition: BlockDefinition): () => void {
    if (!definition.type) throw new Error("Block definition type is required");
    if (this.definitions.has(definition.type)) throw new Error(`Block type ${definition.type} is already registered`);
    this.definitions.set(definition.type, definition);
    let active = true;
    const dispose = (): void => {
      if (!active) return;
      active = false;
      if (this.definitions.get(definition.type) === definition) this.definitions.delete(definition.type);
      this.removeDefinitions.delete(dispose);
      this.notify();
    };
    this.removeDefinitions.add(dispose);
    this.notify();
    return dispose;
  }

  /**
   * Subscribes to block-definition lifecycle changes.
   *
   * The listener runs after a definition is successfully added or removed.
   * Calling the returned function repeatedly is safe.
   *
   * @param listener - Callback invoked after the registry changes.
   * @returns Function that removes this listener.
   */
  subscribe(listener: () => void): () => void {
    return this.listeners.subscribe("blockRegistryChanged", listener);
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
   * @returns Detached input with definition defaults and validated props.
   * @throws If the type is unknown or its property schema rejects the data.
   */
  prepare(input: EditorBlockInput): EditorBlockInput {
    const definition = this.require(input.type);
    const props = mergeProps(definition.defaultProps ?? {}, input.props ?? {});
    return { ...input, props: validateProps(definition, props) };
  }

  /**
   * Prepares properties when an existing block changes native type.
   *
   * Existing values and unknown extension properties survive conversion. A
   * destination-owned field that no longer satisfies its Zod field schema is
   * replaced with that field's registered default. Nested objects are merged
   * first and validated as one destination field.
   *
   * @param type - Registered destination native type.
   * @param current - Detached properties owned by the existing block.
   * @returns Merged, repaired, and validated destination properties.
   * @throws If the type is unknown or invalid data has no valid default.
   */
  prepareTypeChange(type: string, current: Record<string, unknown>): Record<string, unknown> {
    const definition = this.require(type);
    const defaults = definition.defaultProps ?? {};
    const props = mergeProps(defaults, current);
    const shape = (definition.propSchema as { shape?: Record<string, ZodType> } | undefined)?.shape;
    if (shape) {
      for (const [key, schema] of Object.entries(shape)) {
        if (Object.hasOwn(defaults, key) && !schema.safeParse(props[key]).success) {
          props[key] = structuredClone(defaults[key]);
        }
      }
    }
    return validateProps(definition, props);
  }

  /**
   * Validates a complete property object for a stored block.
   *
   * Unknown types pass through unchanged so block data remains recoverable when
   * an optional plugin is not installed.
   *
   * @param type - Persisted native block type.
   * @param props - Complete candidate property object.
   * @returns Validated properties or the original unknown-type properties.
   */
  validate(type: string, props: Record<string, unknown>): Record<string, unknown> {
    return validateProps(this.get(type), props);
  }

  /**
   * Removes every definition owned by this manager.
   *
   * Definitions are disposed in reverse registration order so dependent
   * extensions observe a predictable teardown sequence.
   *
   * @returns No value.
   */
  destroy(): void {
    [...this.removeDefinitions].reverse().forEach((dispose) => dispose());
    this.listeners.clear();
  }

  /**
   * Notifies a stable listener snapshot after a definition change.
   *
   * Snapshot iteration allows listeners to unsubscribe safely while handling
   * the current notification.
   *
   * @returns No value.
   */
  private notify(): void {
    this.listeners.emit("blockRegistryChanged");
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
