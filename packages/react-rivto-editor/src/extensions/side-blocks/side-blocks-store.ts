import type { DocumentModel } from "@chulane/document-model";

/** Prefix for independently collaborative side-block plugin namespaces. */
export const SIDE_BLOCKS_PLUGIN_ID = "rivto.side-blocks.";

/** How a side block affects the vertical position of following content. */
export type SideBlockSpacing = "reserve" | "flow";

/** Where the side-block component is displayed relative to the page. */
export type SideBlockPlacement = "left" | "right" | "full";

/** Persisted, flat side content associated with one document object. */
export interface SideBlock {
  /** Stable record identity. */
  readonly id: string;
  /** Document object ID; missing anchors retain their data until restored or removed. */
  readonly anchorId: string;
  /** Document object family containing the anchor. */
  readonly anchorType: "block" | "element";
  /** Renderer registration selected by the owning extension. */
  readonly type: string;
  /** Whether the block reserves vertical space. */
  readonly spacing: SideBlockSpacing;
  /** Left or right side, or full available editor width. */
  readonly placement: SideBlockPlacement;
  /** Creation timestamp in Unix milliseconds, used with ID for stable ordering. */
  readonly createdAt: number;
  /** Portable data interpreted by the registered renderer. */
  readonly data: unknown;
}

/** Fields required to create a side block. */
export interface CreateSideBlockInput {
  /** Existing document block to associate with the side content. */
  readonly anchorId: string;
  /** Anchor family; defaults to block. */
  readonly anchorType?: "block" | "element";
  /** Registered renderer type. */
  readonly type: string;
  /** Side content data accepted by the document's portable-value validation. */
  readonly data: unknown;
  /** Vertical spacing policy; defaults to reserve. */
  readonly spacing?: SideBlockSpacing;
  /** Layout placement; defaults to right. */
  readonly placement?: SideBlockPlacement;
}

/** Namespace reads borrowed by side-block consumers. */
export interface SideBlockReader {
  /** Lists namespace IDs and reads matching detached records. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "getIds" | "get">;
}

/** Namespace read borrowed by a single-record lookup. */
interface SideBlockLookup {
  /** Reads a detached record by its namespace. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "get">;
}

/** Reads and replaces a side-block record in document history. */
interface SideBlockWriter {
  /** Reads and replaces individual namespaces. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "get" | "set">;
  /** Groups each operation with the document's local history. */
  readonly history: Pick<DocumentModel["history"], "batchUpdates">;
}

/** Removes a side-block record in document history. */
interface SideBlockDeleter {
  /** Deletes one namespace. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "delete">;
  /** Groups removal with the document's local history. */
  readonly history: Pick<DocumentModel["history"], "batchUpdates">;
}

/** Persistence capabilities borrowed by renderers; the caller owns the document. */
export interface SideBlockStorage extends SideBlockWriter {
  /** Reads, replaces, and deletes individual namespaces. */
  readonly pluginData: Pick<DocumentModel["pluginData"], "get" | "set" | "delete">;
}

/** Anchor lookup and persistence needed to create a side block. */
interface SideBlockDocument extends SideBlockWriter {
  /** Checks whether a block anchor exists. */
  readonly blocks: Pick<DocumentModel["blocks"], "hasBlock">;
  /** Checks whether an element anchor exists. */
  readonly elements: Pick<DocumentModel["elements"], "hasElement">;
}

/**
 * Reads one valid side-block record by its stable identity.
 *
 * Malformed records and records whose stored identity differs from the requested
 * identity remain in plugin data and are not returned.
 *
 * @param document - Document containing the side-block namespace.
 * @param id - Stable side-block identity to look up.
 * @returns Detached side-block record, or undefined when it is missing or invalid.
 */
export function getSideBlock(document: SideBlockLookup, id: string): SideBlock | undefined {
  const block = document.pluginData.get<unknown>(`${SIDE_BLOCKS_PLUGIN_ID}${id}`);
  return isSideBlock(block) && block.id === id ? block : undefined;
}

/**
 * Reads valid side-block records from detached plugin data in stable order.
 *
 * Unknown or malformed records remain in plugin data and are omitted from this view.
 *
 * @param document - Document containing the side-block namespace.
 * @returns Detached side blocks ordered by creation time and ID.
 */
export function getSideBlocks(document: SideBlockReader): SideBlock[] {
  return document.pluginData
    .getIds()
    .filter((key) => key.startsWith(SIDE_BLOCKS_PLUGIN_ID))
    .flatMap((key) => {
      const value = getSideBlock(document, key.slice(SIDE_BLOCKS_PLUGIN_ID.length));
      return value ? [value] : [];
    })
    .sort((left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id));
}

/**
 * Creates one independent plugin-data record as a document history operation.
 *
 * @param document - Document owning the anchor, history, and plugin data.
 * @param input - Anchor, renderer type, data, and optional layout policies.
 * @returns The detached newly created side block.
 * @throws If the anchor or type is invalid, or the data is not portable.
 */
export function createSideBlock(
  document: SideBlockDocument,
  input: CreateSideBlockInput,
): SideBlock {
  const anchorType = input.anchorType ?? "block";
  const exists =
    anchorType === "block"
      ? document.blocks.hasBlock(input.anchorId)
      : document.elements.hasElement(input.anchorId);
  if (!exists || !input.type.trim()) {
    throw new Error("Side blocks require an existing anchor and a nonempty type");
  }
  const block: SideBlock = {
    id: crypto.randomUUID(),
    anchorId: input.anchorId,
    anchorType,
    type: input.type,
    spacing: input.spacing ?? "reserve",
    placement: input.placement ?? "right",
    createdAt: Date.now(),
    data: input.data,
  };
  if (!isSideBlock(block)) {
    throw new Error("Invalid side-block layout");
  }
  const key = `${SIDE_BLOCKS_PLUGIN_ID}${block.id}`;
  document.history.batchUpdates(() => document.pluginData.set(key, block));
  return document.pluginData.get<SideBlock>(key)!;
}

/**
 * Replaces the portable content of an existing side block.
 *
 * @param document - Document owning the record and history.
 * @param id - Stable side-block ID.
 * @param data - New portable renderer data.
 * @returns Whether the record existed and was updated.
 * @throws If the data cannot be stored as a portable value.
 */
export function updateSideBlockData(document: SideBlockWriter, id: string, data: unknown): boolean {
  const key = `${SIDE_BLOCKS_PLUGIN_ID}${id}`;
  const block = getSideBlock(document, id);
  if (!block) {
    return false;
  }
  document.history.batchUpdates(() => document.pluginData.set(key, { ...block, data }));
  return true;
}

/**
 * Removes one side block without affecting its anchor or neighboring records.
 *
 * @param document - Document owning the record and history.
 * @param id - Stable side-block ID.
 * @returns Whether a record was removed.
 */
export function deleteSideBlock(document: SideBlockDeleter, id: string): boolean {
  return document.history.batchUpdates(() =>
    document.pluginData.delete(`${SIDE_BLOCKS_PLUGIN_ID}${id}`),
  );
}

/**
 * Checks the structural fields required to safely render a stored record.
 *
 * @param value - Detached, untrusted plugin-data value.
 * @returns Whether the value has the supported side-block structure.
 */
function isSideBlock(value: unknown): value is SideBlock {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }
  const block = value as Record<string, unknown>;
  return (
    typeof block.id === "string" &&
    !!block.id &&
    typeof block.anchorId === "string" &&
    !!block.anchorId &&
    (block.anchorType === "block" || block.anchorType === "element") &&
    typeof block.type === "string" &&
    !!block.type.trim() &&
    (block.spacing === "reserve" || block.spacing === "flow") &&
    (block.placement === "left" || block.placement === "right" || block.placement === "full") &&
    typeof block.createdAt === "number" &&
    Number.isFinite(block.createdAt) &&
    "data" in block
  );
}
