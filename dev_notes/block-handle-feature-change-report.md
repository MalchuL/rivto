# BlockHandle feature-change report

> **Status: proposed feature change — not implemented.**
>
> This report describes a planned change to the public `rivto-editor-core`
> block API. It does not document current runtime behavior. Until this feature
> is implemented, `editor.blocks.getBlock(id)` continues to return a detached
> recursive block snapshot and block operations continue to live on managers.

## Summary

Introduce a lightweight `BlockHandle` in `rivto-editor-core`. A handle binds a
stable block ID to the existing block read, subscription, and command paths. It
is a proxy over current managers, not a new data store and not a CRDT wrapper.

The change is intended to replace repetitive ID-based calls such as:

```ts
editor.blocks.subscribeBlock(blockId, listener);
editor.blocks.getChildIds(blockId);
editor.blocks.getParentId(blockId);
editor.blocks.updateBlock(blockId, patch);
editor.blocks.removeBlock(blockId);
```

with entity-local operations:

```ts
block.subscribe(listener);
block.childIds;
block.parentId;
block.update(patch);
block.remove();
```

Persisted block data remains a separate plain snapshot. `BlockHandle` must not
be serialized, placed in clipboard bundles, or stored in the CRDT.

## Current behavior

The current API exposes detached recursive `Block` values:

```ts
const block = editor.blocks.getBlock(id); // EditorBlock | undefined
```

The returned object contains `id`, `type`, `content`, `props`, `listProps`,
`pluginData`, and recursively materialized `children`. It has no live behavior.
Changing it does not change the document.

Reads, subscriptions, mutations, hierarchy operations, validation, command
routing, transactions, and undo ownership currently remain on focused block
managers. React's `useBlock(id)` already builds a presentation-level version of
the proposed binding by returning `{ block, operations }`.

## Target domain model

The feature introduces two deliberately separate concepts:

- **Block snapshot:** detached, immutable-by-contract, recursively
  serializable document data.
- **Block handle:** editor-bound behavior for one stable block ID. It resolves
  current state through callbacks whenever an operation is performed.

The snapshot should be named `BlockSnapshot` or remain represented by the
existing `EditorBlock` alias during migration. The method-bearing value should
be named `BlockHandle`. Both must not be called simply `Block` in the same
public API because they have different identity, lifetime, and serialization
semantics.

Canvas elements remain a separate domain concept. This feature does not merge
blocks and elements or introduce a generic entity base class.

## Proposed public API

```ts
export interface BlockHandle {
  /** Stable persisted identity bound to this handle. */
  readonly id: string;

  /** Current detached subtree, or undefined after deletion. */
  readonly snapshot: EditorBlock | undefined;

  /** Current direct child IDs without materializing child payloads. */
  readonly childIds: readonly string[];

  /** Current parent ID, null for a root, or undefined after deletion. */
  readonly parentId: string | null | undefined;

  /** Observe changes affecting the current recursive block snapshot. */
  subscribe(listener: () => void): () => void;

  /** Apply a validated patch through the existing command path. */
  update(patch: EditorBlockPatch): void;

  /** Replace collaborative text through the existing command path. */
  setContent(content: string): void;

  /** Convert this block to a registered block type. */
  setType(type: string): void;

  /** Set or remove one native block property. */
  setProp(key: string, value: unknown): void;

  /** Set or remove one plugin-data namespace. */
  setPluginData(pluginId: string, value: unknown): void;

  /** Remove this block and its subtree. */
  remove(): void;

  /** Merge this block into the supplied target block. */
  mergeInto(targetId: string): number;

  /** Move this block after a sibling, or first when the target is null. */
  moveAfter(targetId: string | null): void;

  /** Move this block before a sibling. */
  moveBefore(targetId: string): void;

  /** Move this block to the end of a parent's children. */
  moveInside(parentId: string): void;

  /** Nest this block under its previous sibling. */
  indent(): void;

  /** Move this block out of its current parent. */
  outdent(): void;
}
```

Getters are appropriate for reads. Writes remain explicit methods. Property
setters such as `block.content = value` are excluded because they hide
validation, command execution, transaction boundaries, and possible errors.

## Handle implementation

The implementation class should remain private to `rivto-editor-core`; only
the `BlockHandle` interface is public.

Each handle stores only its ID and a reference to one shared callback backend:

```ts
interface BlockHandleBackend {
  snapshot(id: string): EditorBlock | undefined;
  childIds(id: string): readonly string[];
  parentId(id: string): string | null | undefined;
  subscribe(id: string, listener: () => void): () => void;
  update(id: string, patch: EditorBlockPatch): void;
  setContent(id: string, content: string): void;
  setType(id: string, type: string): void;
  setProp(id: string, key: string, value: unknown): void;
  setPluginData(id: string, pluginId: string, value: unknown): void;
  remove(id: string): void;
  mergeInto(id: string, targetId: string): number;
  move(
    id: string,
    targetId: string | null,
    position: "before" | "after" | "inside",
  ): void;
  indent(id: string): void;
  outdent(id: string): void;
}

class BlockHandleImpl implements BlockHandle {
  constructor(
    readonly id: string,
    private readonly backend: BlockHandleBackend,
  ) {}

  get snapshot(): EditorBlock | undefined {
    return this.backend.snapshot(this.id);
  }

  get childIds(): readonly string[] {
    return this.backend.childIds(this.id);
  }

  get parentId(): string | null | undefined {
    return this.backend.parentId(this.id);
  }

  subscribe(listener: () => void): () => void {
    return this.backend.subscribe(this.id, listener);
  }

  update(patch: EditorBlockPatch): void {
    this.backend.update(this.id, patch);
  }

  remove(): void {
    this.backend.remove(this.id);
  }

  moveAfter(targetId: string | null): void {
    this.backend.move(this.id, targetId, "after");
  }
}
```

The backend object is created once per editor block manager and shared by all
handles. This permits existing manager implementation methods to become
private implementation details without allocating a fresh closure set for
every handle.

The backend must delegate mutations to the existing public command path. It
must not directly write document storage merely to shorten the implementation.
This preserves validation, batching, collaboration, and undo semantics.

## Manager responsibilities that remain

`BlockHandle` owns operations naturally addressed to one existing block.
Operations concerning a collection or a block that does not yet exist remain
on `BlockManager`:

- inserting a block or forest;
- reading root IDs or complete document snapshots;
- subscribing to root order or global structure;
- batch update, removal, move, indent, and outdent;
- cross-document import and ID collision resolution;
- block definition and registry behavior;
- manager destruction and command registration lifecycle.

Bulk operations must not be implemented as loops over handles. Existing batch
methods preflight the complete request and preserve a single transaction and
undo item.

## Resolution and lifecycle semantics

The proposed `editor.blocks.getBlock(id)` returns `BlockHandle | undefined`.
It returns undefined when the block is not currently placed in the document
tree, preserving the current distinction between a placed block and an
orphaned storage record.

A retained handle can outlive its block. After local or remote deletion:

- `snapshot` returns `undefined`;
- `parentId` returns `undefined`;
- `childIds` returns an empty list;
- subscribers receive the deletion notification;
- mutation methods retain the corresponding existing manager method's
  missing-target behavior.

Reinserting the same ID must not allow an old handle to bypass current
validation. Because every operation resolves by ID at call time, it acts on
current state. If old-handle access to a reinserted identity is considered
unsafe, the model will need an additional generation identity; that is outside
the initial feature and should be added only for a demonstrated requirement.

Global handle identity is not initially guaranteed. Callers that need a stable
handle, including React hooks, retain or memoize the resolved handle. A strong
manager cache would otherwise retain every requested historical block ID until
editor destruction.

## React integration

`useBlock(blockId)` should subscribe through the handle but continue returning
the detached snapshot needed by `useSyncExternalStore`:

```ts
const handle = useMemo(
  () => editor.blocks.getBlock(blockId),
  [blockId, editor],
);

const block = useSyncExternalStore(
  handle ? handle.subscribe.bind(handle) : subscribeMissing,
  () => handle?.snapshot,
  () => handle?.snapshot,
);
```

The concrete implementation should avoid rebinding `subscribe` each render;
the example only shows ownership. Existing focused snapshot identity remains
the React change-detection contract.

React-owned `listProps` validation is a boundary that this feature must
preserve. The React block manager currently validates extension-owned list
properties before calling core. A core handle's `update()` must not silently
bypass that behavior. The initial migration should retain the React validation
wrapper for list-property mutations rather than move presentation policy into
core.

## Persistence, clipboard, and CRDT boundaries

This feature requires no persisted schema migration.

`document-model` continues to own plain block snapshots and adapter-neutral
CRDT operations. It must not import `BlockHandle` or return handles from
`DocumentBlockManager.getBlock()`.

The following boundaries continue to use snapshots only:

- `DocumentModel.getSnapshot()` and `loadSnapshot()`;
- editor `dump()` and `load()`;
- structured clipboard bundles;
- cross-document block transfer;
- desktop document files;
- demo fixtures and test snapshots;
- provider and persistence payloads.

No handle, backend callback, command manager, or CRDT object may become an
enumerable member of a block snapshot.

## Performance requirements

The proxy must reuse current document-model behavior:

- cached recursive block snapshots;
- per-block subscriptions;
- cached root IDs;
- the parent index;
- ID-only direct-child reads;
- command batching and CRDT transactions.

The handle itself should add one small object allocation when resolved and one
backend reference. Prototype methods are shared. The callback backend is
allocated once per manager.

The implementation must avoid these regressions:

- materializing a recursive subtree merely to construct a handle;
- reading a fresh recursive snapshot once for every property getter;
- allocating child handles when only child IDs are requested;
- automatically creating a document subscription for every handle;
- retaining every historical handle in a permanent strong map;
- implementing batch commands as repeated single-block commands;
- bypassing current snapshot caches by reading CRDT containers directly.

`BlockHandle` is an API and modularity improvement, not by itself a rendering
optimization. Shallow block snapshots, finer record-versus-subtree
subscriptions, or a new handle cache should be separate measured changes.

## Change surface

### `packages/rivto-editor-core`

- Add the public `BlockHandle` interface.
- Add the private `BlockHandleImpl` and callback backend.
- Change the public block resolution API to return handles.
- Retain manager batch and collection operations.
- Preserve all existing command registrations and mutation semantics.
- Update exports and module documentation.

### `packages/react-rivto-editor`

- Resolve and memoize handles in `useBlock`.
- Subscribe using the handle while returning detached snapshots.
- Replace local bound operations where core handle semantics are equivalent.
- Retain React-specific list-property validation.
- Update direct `getBlock()` consumers to read `handle.snapshot`.

### Demo, tests, documentation, and applications

- Update direct reads of `content`, `props`, `listProps`, and `children`.
- Keep snapshot construction and persistence types plain.
- Update public API documentation to distinguish handles from snapshots.
- Update tests that currently compare `getBlock()` results by snapshot identity.

## Migration strategy

1. Add `BlockHandle`, its private implementation, and focused tests without
   changing document-model snapshots.
2. Add a temporary core resolution method such as `getBlockHandle(id)` and
   migrate internal React consumers.
3. Verify React validation, focused subscriptions, undo grouping, clipboard,
   snapshot serialization, page mode, and edgeless mode.
4. In the intended breaking release, make `getBlock(id)` return the handle and
   expose an explicitly named snapshot read where imperative snapshot access is
   still required.
5. Remove the temporary compatibility method after repository consumers are
   migrated.

The staged approach prevents the same method name from temporarily returning
different concepts to different packages.

## Required tests

- A resolved handle delegates reads and mutations to the correct stable ID.
- `snapshot` retains existing caching and referential-equality behavior.
- A child mutation notifies its recursive ancestor subscribers but not an
  unrelated sibling.
- Local and remote deletion make a retained handle read as missing.
- Root reorder retains existing block snapshot identity behavior.
- `childIds` does not require child snapshot materialization.
- Handle mutations create the same transaction and undo behavior as manager
  mutations.
- Bulk manager mutations remain atomic and create one undo item.
- Snapshot, clipboard, and cross-document values contain no handle state.
- React list-property validation is not bypassed.
- Page and edgeless rendering remain behaviorally unchanged.

## Non-goals

- Exposing CRDT maps, arrays, or text through a block handle.
- Making snapshots mutable.
- Adding JavaScript property setters for persisted data.
- Replacing manager-level collection and bulk operations.
- Combining blocks and canvas elements into one generic entity hierarchy.
- Adding `ElementHandle` before an independent element use case requires it.
- Changing snapshot version 6 or the persisted CRDT layout.
- Reworking subscription granularity or virtualization as part of this feature.

## Acceptance criteria

The feature is complete when:

1. Core consumers can resolve a `BlockHandle` and perform single-block reads,
   subscriptions, and commands without repeatedly passing its ID.
2. Every mutation still follows the existing command, validation,
   transaction, collaboration, and undo paths.
3. Snapshots remain plain, detached, version-6-compatible values.
4. React focused rendering retains current snapshot identity and notification
   behavior.
5. Bulk operations remain manager-owned and atomic.
6. The change introduces no new runtime dependency and no persisted migration.

