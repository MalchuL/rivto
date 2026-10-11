import type {
  Block,
  BlockInput,
  BlockNode,
  BlockPatch,
  BlockUpdate,
  ElementNode,
  DocumentElement,
  ElementFrame,
  ElementInput,
  ElementPatch,
  ElementUpdate,
  Snapshot,
  SnapshotUpdate,
} from "@chulane/document-model";

/** Collaborative canvas geometry as seen by editor features. */
export type EditorElementFrame = ElementFrame;

/**
 * Detached flat canvas element exposed to editor integrations.
 * Includes ordered childIds without materializing descendants; getParentId resolves placement.
 * Manager reads can share cached objects, so treat these snapshots as read-only.
 */
export type EditorElementNode<Props extends Record<string, unknown> = Record<string, unknown>> = ElementNode<Props>;

/**
 * Detached element with its complete recursive child tree in sibling order.
 * Uses children instead of childIds; unchanged branches may share cached objects.
 * The Props parameter describes this node's properties, not every descendant.
 */
export type EditorElement<Props extends Record<string, unknown> = Record<string, unknown>> = DocumentElement<Props>;

/**
 * Creation input for an element and optional recursive children.
 * Supplied IDs are preserved and must not collide; missing IDs are allocated.
 * New descendants are attached according to their input nesting. Elements with children may omit their initial
 * frame to derive it from direct children; leaves require a frame.
 * childIds can instead reparent existing subtrees from the same document.
 */
export type EditorElementInput<Props extends Record<string, unknown> = Record<string, unknown>> = ElementInput<Props>;

/**
 * Geometry, stacking order, and property changes for an existing element.
 * Fields and props are shallow-merged; undefined property values delete keys.
 * Identity, type, parentage, and child lists cannot change through a patch.
 */
export type EditorElementPatch = ElementPatch;

/** One identified canvas element patch used by atomic updates. */
export type EditorElementUpdate = ElementUpdate;

/** Canonical detached block value rendered by editor integrations. */
export type EditorBlock = Block;
/** Canonical block creation data accepted by editor helpers. */
export type EditorBlockInput = BlockInput;
/** Canonical mutable block fields. */
export type EditorBlockPatch = BlockPatch;
/** Canonical identified block patch. */
export type EditorBlockUpdate = BlockUpdate;

/** Detached block fields excluding the recursively materialized child tree. */
export type EditorBlockNode = BlockNode;

/** Lossless editor document value used for persistence. */
export type EditorSnapshot = Snapshot;

/** Persisted document sections that replace only supplied state. */
export type EditorSnapshotUpdate = SnapshotUpdate;
