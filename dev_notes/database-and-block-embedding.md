# Database persistence and block embedding

## Decision

Keep `DocumentModelImpl` as the runtime model for one open document.

Store documents in normalized database tables and convert those rows to and
from Rivto snapshots. Use snapshots for initial hydration and checkpoints.
While a document is open, apply live changes through `DocumentModelImpl` or
Yjs rather than repeatedly replacing the complete snapshot.

Represent an embedded block as an ordinary local `embed` block whose props
point to a canonical block in another document or source. Do not copy the
target block into the host document unless the user explicitly imports it.

This supports database persistence, journals, AI access, and read-only live
embeds without changing Rivto's current block schema.

## Goals

- Persist documents, blocks, tree placement, links, and metadata in a database.
- Reconstruct a Rivto `Snapshot` deterministically.
- Save complete checkpoints periodically and optionally retain incremental
  changes between checkpoints.
- Use Yjs/`DocumentModelImpl` to synchronize two editors opened on the same
  document.
- Embed a block or subtree from another Rivto document.
- Leave a clear path for database/API-backed embeds and editable transclusion.

## Non-goals for the first implementation

- One undo transaction spanning multiple documents or external databases.
- Selecting text continuously across a host document and an embedded document.
- Rendering the same canonical block as two native tree nodes in one document.
- A general source framework before a second source type actually exists.

## Database representation

A minimal relational representation is:

```text
documents
  id
  kind                 // document, journal, whiteboard
  journal_date         // nullable
  metadata_json
  revision
  created_at
  updated_at

blocks
  id
  document_id
  type
  content
  props_json
  plugin_data_json
  revision
  created_at
  updated_at

document_tree
  document_id
  block_id
  parent_block_id      // null for a root
  position
  layout_json

links
  id
  document_id
  from_block_id
  to_block_id
  meta_json

document_changes       // optional
  id
  document_id
  revision
  operation
  payload_json
  created_at
```

`blocks.document_id` gives every native block one owning document. A reference
to another document is stored as an `embed` block; the foreign block is not
inserted into the host tree.

The existing collapse property may remain in `props_json` while every block has
one native placement. If canonical blocks later become direct members of
multiple documents, collapse and layout must move to occurrence records.

## Snapshot conversion

Opening a document:

```text
documents + blocks + document_tree + links
  -> validate rows
  -> order siblings by position
  -> recursively assemble Block.children
  -> create Snapshot version 3
  -> editor.load(snapshot)
```

Saving a checkpoint:

```text
editor.dump()
  -> flatten Block.children
  -> upsert block values
  -> upsert parent and position rows
  -> upsert links and document metadata
  -> remove rows absent from the saved revision
  -> commit one database transaction
```

The conversion is expected to be one-to-one:

| Database value | Snapshot value |
| --- | --- |
| `blocks.id` | `Block.id` |
| `blocks.type` | `Block.type` |
| `blocks.content` | `Block.content` |
| `blocks.props_json` | `Block.props` |
| `blocks.plugin_data_json` | `Block.pluginData` |
| `document_tree` | `Block.children` and `Block.layout` |
| `links` | `Snapshot.links` |
| `documents.metadata_json` | `Snapshot.pluginData` |

Conversion code belongs in the application persistence layer, not in
`DocumentModelImpl`.

## Checkpoints, revisions, and incremental changes

Periodic complete checkpoints are sufficient for the initial implementation.
A document revision prevents an older saver from overwriting newer persisted
state.

An optional change log can store operations between checkpoints:

```ts
type StoredChange =
  | { action: "block.insert"; block: BlockInput; afterId?: string | null }
  | { action: "block.update"; blockId: string; patch: BlockPatch }
  | { action: "block.move"; blockId: string; targetId: string | null; position: "before" | "after" | "inside" }
  | { action: "block.remove"; blockId: string }
  | { action: "link.create"; link: Link }
  | { action: "link.remove"; linkId: string };
```

Each change needs a unique ID and monotonically increasing document revision.
Applying a change twice must either be harmless or be rejected as already
applied. Compact the log into a checkpoint periodically instead of requiring
unbounded replay.

## Live synchronization

For two editors on the same document:

```text
Editor A ----\
              Yjs provider -> one converged DocumentModel
Editor B ----/
                         |
                         -> periodic database checkpoint/change persistence
```

The database is durable storage and a query/index surface. Yjs is the live
coordination mechanism while the document is open.

Initial hydration may use `editor.load(snapshot)`. After opening, remote changes
should arrive as Yjs updates or as granular document operations. Do not call
`loadSnapshot({ blocks })` for every changed block because that replaces the
complete block section.

If an external database writer can edit an open document, translate its
revisioned change into the same granular document operation and publish it to
the open Yjs session.

## Journal documents

A journal is a normal document:

```text
kind = "journal"
journal_date = "2026-07-23"
```

The application owns:

- `getOrCreateJournal(date)`
- timezone and day-boundary rules
- previous/next journal navigation
- optional journal templates
- querying a date range

A continuous journal screen is a view over several journal documents. It does
not need to persist another combined document.

## Embed representation

The host document stores an ordinary block:

```ts
type EmbedTarget = {
  source: "rivto";
  documentId: string;
  blockId: string;
};

const embed: BlockInput = {
  type: "embed",
  props: {
    target: {
      source: "rivto",
      documentId: "journal:2026-07-23",
      blockId: "block-42",
    },
    view: "subtree",
  },
};
```

The embed block has its own local ID, parent, order, layout, selection, and
deletion behavior. Its target remains owned by the target document.

Deleting the embed deletes only the reference. Deleting the target leaves a
missing-target state in the embed until the user changes or removes it.

## Read-only embedding

Implement read-only embedding first:

```text
Embed renderer
  -> read target descriptor
  -> repository.open(target.documentId)
  -> resolve target.blockId
  -> subscribe to target document changes
  -> render the block or subtree
```

Required application pieces:

1. An `embed` `BlockDefinition` with a Zod schema for its props.
2. An embed React renderer.
3. A document repository that deduplicates open document sessions and releases
   them when no editor or embed uses them.
4. Loading, missing, denied, and error states.
5. A subscription from the embed renderer to its target document.
6. Cycle and maximum-depth checks.

For the first version, the host editor selects and copies the embed block as
one block. Embedded descendants do not participate in host text selection,
dragging, or host undo.

## Document repository

Start with the concrete operation needed by Rivto embeds:

```ts
interface DocumentHandle {
  readonly document: DocumentModelImpl;
  release(): void;
}

interface DocumentRepository {
  open(documentId: string): Promise<DocumentHandle>;
}
```

The repository owns database hydration, provider attachment, caching, and
reference counting. Ten embeds of the same document should share one loaded
document session.

Add a general source registry only when a second source, such as SQL query
results or an external API, is implemented.

## Editable embedding

Editable transclusion means the target document owns the mutation:

```text
User edits an embedded target
  -> resolve target document
  -> execute against that document's runtime/model
  -> target Yjs update
  -> every target editor and embed rerenders
```

Do not update the host embed block's copied content. It stores only the target
address and local display options.

Before enabling editing, define:

- target-document write permissions
- which undo history owns the change
- behavior while the target is offline
- handling of a deleted or moved target
- event isolation between the host and embedded editor
- copy-reference versus copy-content behavior

Native Rivto-to-Rivto editing should be implemented before editing arbitrary
database/API projections.

## Other database and API sources

When a second source is needed, generalize the target:

```ts
type BlockAddress = {
  sourceId: string;
  documentId?: string;
  blockId: string;
};
```

Then register source-specific resolvers:

```ts
interface BlockSource {
  getBlock(address: BlockAddress): Promise<ResolvedBlock | undefined>;
  getChildren(address: BlockAddress): Promise<ResolvedBlock[]>;
  subscribe?(address: BlockAddress, listener: () => void): () => void;
}
```

An external result is a projection. It should not be inserted into the host
snapshot unless the user chooses an explicit import/materialize action.

Source capabilities should distinguish read-only and writable targets. Do not
offer editing when a source cannot provide permissions, conflict detection, and
an update operation.

## Direct shared occurrences

The reference-block design does not require changing Rivto IDs.

Only introduce separate occurrence IDs if the product later requires the same
canonical block to behave as a native tree node more than once in one document:

```text
document_nodes
  node_id
  document_id
  block_id
  parent_node_id
  position
  layout_json
  collapsed
```

That model separates canonical content (`block_id`) from placement
(`node_id`). It requires changes to selection, commands, DOM markers, clipboard,
and snapshots, so it should not be added for ordinary reference-block embeds.

## Performance work

Database persistence and a small number of embeds do not require an immediate
renderer rewrite. Before rendering thousands of visible blocks or many live
embeds, add:

- direct indexed `getBlock(id)` over the document block map
- direct root, child, and parent lookup
- block- or selector-level subscriptions
- virtualization for journal feeds and large query results

The current complete-tree materialization and editor-wide revision are correct
for initial functionality but are too coarse for large projections.

## AI integration

The normalized database is an appropriate read surface for AI. AI can query
documents, journal ranges, links, and selected blocks without mounting an
editor.

AI should return validated incremental operations:

```ts
type AIChange = {
  action: "block.update";
  documentId: string;
  blockId: string;
  expectedRevision: number;
  patch: BlockPatch;
};
```

If the target document is open, apply the operation through its current
`DocumentModelImpl` so Yjs, subscriptions, selection reconciliation, and undo
behavior remain coherent. If it is closed, apply the same validated operation
through the persistence service with revision checking.

## Implementation order

1. Add normalized database tables and snapshot conversion.
2. Add revision-checked periodic checkpoints.
3. Connect open editors through one Yjs document/provider.
4. Add optional incremental change persistence and compaction.
5. Add journal lookup and navigation.
6. Add the read-only Rivto `embed` block and document repository.
7. Add missing-target, permission, recursion, and lifecycle tests.
8. Add editable Rivto embeds only when the product requires them.
9. Generalize to a source registry when implementing a second source.
10. Add indexed reads and focused subscriptions when document size requires
    them.

## Minimum tests

- Database rows round-trip through `Snapshot` without losing block data, order,
  layout, links, or document plugin data.
- A stale document revision cannot overwrite a newer checkpoint.
- Replaying an already-applied change does not duplicate its effect.
- Two editors connected to the same Yjs document converge.
- An embed updates when its target document changes.
- Deleting an embed does not delete its target.
- A missing or unauthorized target renders an explicit state.
- A self-embed or recursive embed chain is stopped.
- Closing the last consumer releases the target document session.

