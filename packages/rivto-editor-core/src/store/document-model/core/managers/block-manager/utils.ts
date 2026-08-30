import type { CRDTArray } from "../../../../crdt-doc";
import type { BlockInput, BlockListProps, BlockPropsValidator, Link } from "../../types";
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
  /** Optional schema validator applied to each block's props. */
  readonly validateProps?: BlockPropsValidator;
  /** Parent type of the forest roots; `null` is the document root. */
  readonly parentType?: string | null;
  /** Optional parent/child placement check applied to every node. */
  readonly validateParent?: (childType: string, parentType: string | null) => void;
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
    options.validateParent?.(block.type, parentType);
    if (options.requireComplete) {
      if (typeof block.content !== "string") throw new Error("Block content must be a string");
      if (!Array.isArray(block.children)) throw new Error("Snapshot block children must be an array");
      validateBlockListProps(block.listProps);
      assertPortableRecord(block.props, "block.props");
      assertPortableRecord(block.pluginData, "block.pluginData");
      options.validateProps?.(block.type, block.props);
    } else {
      if (block.content !== undefined && typeof block.content !== "string") {
        throw new Error("Block content must be a string");
      }
      if (block.children !== undefined && !Array.isArray(block.children)) {
        throw new Error("Snapshot block children must be an array");
      }
      if (block.listProps !== undefined) validateBlockListProps(block.listProps);
      if (block.props !== undefined) {
        assertPortableRecord(block.props, "block.props");
        options.validateProps?.(block.type, block.props);
      } else {
        options.validateProps?.(block.type, {});
      }
      if (block.pluginData !== undefined) assertPortableRecord(block.pluginData, "block.pluginData");
    }
    (block.children ?? []).forEach((child) => visit(child, block.type));
    visiting.delete(block);
  };
  blocks.forEach((block) => visit(block, options.parentType ?? null));
  return ids;
}

/**
 * Validates a portable link collection against a known set of block IDs.
 *
 * @param links - Candidate link records.
 * @param blockIds - Block IDs that endpoints must reference.
 * @returns No value.
 * @throws {Error} When an ID is empty, duplicated, malformed, or dangling.
 */
export function validateLinkCollection(
  links: readonly Link[],
  blockIds: ReadonlySet<string>,
): void {
  if (!Array.isArray(links)) throw new Error("Snapshot links must be an array");
  const ids = new Set<string>();
  links.forEach((link) => {
    validateLinkRecord(link, blockIds);
    if (ids.has(link.id)) throw new Error(`Duplicate link ${link.id}`);
    ids.add(link.id);
  });
}

/**
 * Validates one complete portable link record.
 *
 * @param link - Candidate link.
 * @param blockIds - Block IDs that endpoints must reference.
 * @returns No value.
 * @throws {Error} When the record, ID, endpoints, or meta are invalid.
 */
export function validateLinkRecord(link: Link, blockIds?: ReadonlySet<string>): void {
  if (!link || typeof link !== "object" || Array.isArray(link)) {
    throw new Error("Link record is invalid");
  }
  requireNonemptyId(link.id, "Link");
  validateLinkEndpoint(link.from, "Link from");
  validateLinkEndpoint(link.to, "Link to");
  if (link.meta !== undefined) assertPortableRecord(link.meta, "link.meta");
  if (blockIds && (!blockIds.has(link.from.blockId) || !blockIds.has(link.to.blockId))) {
    throw new Error("Link endpoints must reference existing blocks");
  }
}

/**
 * Validates one link endpoint object.
 *
 * @param endpoint - Candidate `{ blockId, port? }` value.
 * @param label - Noun used in the error.
 * @returns No value.
 * @throws {Error} When the endpoint is missing a nonempty block ID.
 */
function validateLinkEndpoint(endpoint: Link["from"] | Link["to"], label: string): void {
  if (!endpoint || typeof endpoint !== "object" || Array.isArray(endpoint)) {
    throw new Error(`${label} endpoint is invalid`);
  }
  requireNonemptyId(endpoint.blockId, `${label} block`);
  if (endpoint.port !== undefined && typeof endpoint.port !== "string") {
    throw new Error(`${label} port must be a string`);
  }
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
