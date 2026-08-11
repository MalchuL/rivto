# Database-backed ID resolution

## Opinion

Rivto can support records that exist in a database but are not present in the
open document. The database lookup should be explicit and owned by the host
application. It should not be added as a fallback to
`DocumentBlockManager.getBlock(id)`.

The useful distinction is:

- **local ID**: owned by the currently open `DocumentModel`; synchronous core
  getters and commands may use it;
- **global ID**: identifies exactly one persisted entity across the database; a
  host repository resolves its kind and ownership before it can be used.

Callers should store and pass only the global ID. Database ownership metadata,
such as the document containing a block, is an implementation detail returned
by resolution rather than part of the reference.

The database should enforce this with a global entity table or equivalent
unique index:

```text
entities(id primary key, kind)
```

Typed tables use that ID as a foreign key. UUID generation makes collisions
unlikely; the global constraint makes the one-ID/one-entity rule true.

## What the current code guarantees

`DocumentModel` represents one complete, live collaborative document:

- `document.blocks.getBlock(id)` is synchronous and returns a detached subtree
  only when the block record exists and is placed in this document's tree;
- root and child arrays contain local block IDs;
- `normalize()` removes missing tree references and restores orphaned local
  records to the root list;
- links may only connect blocks present in the same document;
- editor selection drops endpoints whose blocks disappear;
- `editor.load(snapshot)` replaces supplied snapshot sections and establishes a
  new undo baseline.

These are valuable invariants. Making `getBlock` query a database would change
its return type to a promise, make rendering trigger I/O, and leave commands
unsure which document owns a resolved block. It would also create accidental
N+1 queries during tree traversal and sibling-number calculation.

The CRDT provider interface is not this lookup boundary. Providers synchronize
updates for one already-selected `CRDTDoc`; they do not locate arbitrary blocks
across stored documents.

## Smallest compatible design

Add a repository in the application or persistence package, not in editor
core. Because one ID namespace covers every entity, resolution returns a
discriminated result:

```ts
interface DocumentSession {
  readonly editor: RivtoEditorApi;
  release(): void;
}

type ResolvedEntity =
  | { kind: "block"; id: string; session: DocumentSession }
  | { kind: "document"; id: string; session: DocumentSession }
  | { kind: "missing"; id: string };

interface EntityRepository {
  resolve(id: string): Promise<ResolvedEntity>;
}
```

The union above shows only the document kinds needed by the editor. The
application's canonical union should also contain every other globally
addressable entity kind. Consumers switch on `kind` rather than trying several
tables with the same ID.

For a block ID, `resolve` should:

1. Query the global ID index and verify that the entity is a block.
2. Discover the owning document from the block row.
3. Return its cached session when that document is already open.
4. Otherwise fetch and validate the document snapshot or persisted Yjs update.
5. Create and hydrate the core editor, then attach its live provider if enabled.
6. Reference-count consumers so several references share one session.

The caller then performs a normal local lookup on the resolved owner:

```ts
const target = await repository.resolve(targetId);
const block = target.kind === "block"
  ? target.session.editor.blocks.getBlock(target.id)
  : undefined;
```

The database result does not get inserted into the host document. The host
stores a local reference block with the target's global ID in validated props.
Importing or duplicating content should remain a separate, explicit command.

## When a database request happens

Only a feature that declares a global reference should request it. The first
such feature should be a read-only `embed` or `reference` block:

```text
host getBlock(embedId)
  -> embed renderer reads targetId
  -> repository.resolve(targetId)
  -> verify kind === "block"
  -> owning target editor getBlock(targetId)
  -> loading | ready | missing | denied | error
```

An ordinary miss from `hostEditor.blocks.getBlock(id)` continues to mean
"not in this document." This prevents stale selections, malformed child IDs,
and programming mistakes from silently becoming network requests.

## Can the current code be adapted?

Yes, for read-only references, with no core runtime changes. Current pieces
already provide:

- stable block IDs and validated block props for storing a global target ID;
- `editor.load()` for initial snapshot hydration;
- `editor.subscribe()` for remote/local invalidation;
- React block extensions for installing the reference definition and renderer;
- independent core editor instances, so the target document retains ownership.

The missing pieces are host-level database-to-snapshot conversion, the cached
repository, and the reference renderer. The current demo application still
stores TipTap HTML in an in-memory page map, so it needs persistence migration
before it can supply real Rivto document sessions.

## What requires a larger model change

Do not treat these as the first implementation:

- **Partially loaded native trees.** Current root/children arrays and
  normalization assume a complete document. Lazy native children need an
  explicit unresolved-node representation and async tree APIs.
- **Transparent cross-document links.** Current links validate both endpoints
  locally. External links need globally resolved endpoints and separate
  navigation or preview semantics.
- **Editable transclusion.** Mutations, selection, clipboard, permissions, and
  undo must route to the target editor rather than the host editor.
- **One canonical block mounted multiple times as native nodes.** This needs
  occurrence IDs separate from canonical block IDs.

Add any of these only after the read-only reference path proves insufficient.

## Required checks for the first implementation

- one entity lookup for several references to the same target;
- one loaded session for targets owned by the same document;
- release only after the final consumer unmounts;
- loading, missing block, missing document, denied, and transport-error states;
- updates in an open target document rerender every reference;
- reference deletion does not delete the target;
- target deletion produces a stable missing state;
- self-reference, longer cycles, and excessive nesting stop deterministically;
- host selection and undo do not include target descendants.
