import type {
  Block,
  BlockInput,
  BlockNode,
  BlockPatch,
  BlockUpdate,
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

/** Detached first-class canvas element exposed to editor integrations. */
export type EditorElement<Props extends Record<string, unknown> = Record<string, unknown>> = DocumentElement<Props>;

/** Complete input accepted when creating a canvas element. */
export type EditorElementInput<Props extends Record<string, unknown> = Record<string, unknown>> = ElementInput<Props>;

/** Mutable canvas element fields. */
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
