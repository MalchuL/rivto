import type { CRDTArray } from "../../../../crdt-doc";
import type { BlockInput, BlockListProps } from "../../types";
import type { BlockPipe } from "./block-pipe";
import { assertPortableRecord, assertPortableValue, requireNonemptyId } from "../../utils/portable";

/**
 * Options for validating a portable block forest before any CRDT write.
 *
 * Snapshot loads require complete records. Insert accepts partial BlockInput
 * and only checks fields the caller actually supplied.
 */
export interface ValidateBlockForestOptions {
  /** When true, every block must carry id, type, content, children, and records. */
  readonly requireComplete?: boolean;
  /** IDs already present in storage that incoming supplied IDs must not collide with. */
  readonly existingIds?: ReadonlySet<string>;
  /** Parent type of the forest roots; `null` is the document root. */
  readonly parentType?: string | null;
  /** Installed block pipe applied to every node in document order. */
  readonly pipe?: BlockPipe;
}

/**
 * Validates an opaque list-property record before it reaches CRDT storage.
 *
 * Accepted values are finite numbers, strings, booleans, null, arrays, and
 * recursively nested plain records. The function validates without transforming
 * the supplied record.
 *
 * @param value - Candidate top-level list-property record.
 * @returns The original value narrowed to `BlockListProps` after validation.
 * @throws {TypeError} When the top level is not a record or a nested value is
 * unsupported, non-finite, non-plain, or cyclic.
 */
export function validateBlockListProps(value: unknown): BlockListProps {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("block.listProps must be an object");
  }
  assertPortableValue(value, "block.listProps");
  return value as BlockListProps;
}

/**
 * Collects every supplied block identifier in a detached forest.
 *
 * @param blocks - Root blocks or inputs to walk in document order.
 * @returns Unique supplied IDs. Generated IDs are not represented.
 */
export function collectBlockIds(blocks: readonly BlockInput[]): Set<string> {
  const ids = new Set<string>();
  const visit = (block: BlockInput): void => {
    if (typeof block.id === "string" && block.id.trim() !== "") ids.add(block.id);
    block.children?.forEach(visit);
  };
  blocks.forEach(visit);
  return ids;
}

/**
 * Validates a portable block forest before the first destructive write.
 *
 * Unique nonempty IDs, nonempty types, portable records, schema props, and
 * acyclic children are all checked. CRDT transactions do not roll back, so
 * this preflight is the atomicity boundary for insert and snapshot load.
 *
 * @param blocks - Root blocks or inputs to validate recursively.
 * @param options - Completeness, collision, and schema-validation policy.
 * @returns Collected supplied IDs after a successful preflight.
 * @throws {Error} When any descendant is malformed, duplicated, or cyclic.
 */
export function validateBlockForest(
  blocks: readonly BlockInput[],
  options: ValidateBlockForestOptions = {},
): Set<string> {
  const ids = new Set<string>();
  const visiting = new Set<BlockInput>();
  const visit = (block: BlockInput, parentType: string | null): void => {
    if (!block || typeof block !== "object" || Array.isArray(block)) {
      throw new Error("Snapshot block children must be an array");
    }
    if (visiting.has(block)) throw new Error("Block forest must be acyclic");
    visiting.add(block);
    if (options.requireComplete || block.id !== undefined) {
      const id = requireNonemptyId(block.id, "Block");
      if (ids.has(id)) throw new Error(`Duplicate block ${id}`);
      if (options.existingIds?.has(id)) throw new Error(`Block ${id} already exists`);
      ids.add(id);
    }
    if (!block.type || typeof block.type !== "string") throw new Error("Block type is required");
    const validated = options.pipe?.process(block, { parentType }) ?? block;
    if (options.requireComplete) {
      if (typeof validated.content !== "string") throw new Error("Block content must be a string");
      if (!Array.isArray(validated.children)) throw new Error("Snapshot block children must be an array");
      validateBlockListProps(validated.listProps);
      assertPortableRecord(validated.props, "block.props");
      assertPortableRecord(validated.pluginData, "block.pluginData");
    } else {
      if (validated.content !== undefined && typeof validated.content !== "string") {
        throw new Error("Block content must be a string");
      }
      if (validated.children !== undefined && !Array.isArray(validated.children)) {
        throw new Error("Snapshot block children must be an array");
      }
      if (validated.listProps !== undefined) validateBlockListProps(validated.listProps);
      if (validated.props !== undefined) {
        assertPortableRecord(validated.props, "block.props");
      }
      if (validated.pluginData !== undefined) assertPortableRecord(validated.pluginData, "block.pluginData");
    }
    (validated.children ?? []).forEach((child) => visit(child, validated.type));
    visiting.delete(block);
  };
  blocks.forEach((block) => visit(block, options.parentType ?? null));
  return ids;
}

/**
 * Materializes string identifiers from a collaborative array.
 *
 * This helper keeps adapter-specific array conversion out of tree algorithms.
 *
 * @param array - Collaborative array containing block identifiers.
 * @returns Detached string identifiers in collaborative order.
 */
export function strings(array: CRDTArray<string>): string[] {
  return array.toArray().map(String);
}

/**
 * Converts optional block content into its persisted string representation.
 *
 * @param content - Optional content supplied during block creation.
 * @returns Supplied content, or an empty string when content is omitted.
 */
export function contentFrom(content: BlockInput["content"]): string {
  return content ?? "";
}
