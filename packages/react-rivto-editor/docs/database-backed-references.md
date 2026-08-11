# Database-backed block references in React

## Recommendation

Implement database-backed content as a React block extension configured with a
host-owned `EntityRepository`. Keep `useBlock(id)` local and synchronous.

This fits the existing boundary: `EditorView` rerenders from the core editor's
revision, `BlockTree` resolves local IDs, and renderers invoke operations on the
same core editor. A foreign block cannot safely enter that path because its
operations, subscription, selection, and undo belong to another editor.

## Reference block

The host document should contain a normal local block whose props hold the
target's globally unique ID:

```ts
type ReferenceProps = {
  targetId: string;
  view: "block" | "subtree";
};
```

Register it with the existing `blockExtension` mechanism. Capture the
repository in the extension factory or renderer closure; a new global manager
on `ReactEditor` is unnecessary while references are the only consumer.

```ts
const databaseReferenceExtension = (
  repository: EntityRepository,
): ReactEditorExtension => blockExtension({
  definition: referenceDefinition,
  render: (props) => <DatabaseReference {...props} repository={repository} />,
});
```

The exact factory composition may vary, but ownership should remain the same:
the application supplies I/O, and the extension supplies presentation.

## Hook lifecycle

The renderer needs a small async hook with a discriminated result:

```ts
type ReferenceResult =
  | { status: "loading" }
  | { status: "ready"; targetId: string; session: DocumentSession; block: EditorBlock }
  | { status: "unsupported"; entityKind: string }
  | { status: "missing" }
  | { status: "denied" }
  | { status: "error"; error: unknown };
```

Its lifecycle is:

1. Read and validate `targetId` from the local reference block.
2. Start `repository.resolve(targetId)` in an effect, never during render.
3. Verify that the resolved entity kind can be rendered by this reference.
4. Ignore or cancel completion after the target changes or the component
   unmounts.
5. Subscribe to the resolved owner editor with `useSyncExternalStore`.
6. Re-run `targetEditor.blocks.getBlock(targetId)` on each target revision.
7. Release the session during cleanup.

The repository, not each hook, deduplicates entity lookups, in-flight loads,
and open sessions. This avoids duplicate requests under React Strict Mode and when several
references target the same document.

## Rendering choices

For the first version, render a read-only preview component from the detached
target block. Do not reuse the host `BlockTree`: it reads `EditorContext`, so
its commands and selection would target the host editor.

Two later options are valid when richer rendering is required:

- create a read-only tree renderer that receives the target editor explicitly;
- mount a nested target `ReactEditor` boundary with isolated events and
  selection.

The first is smaller. The second is appropriate only for interactive/editable
transclusion and requires explicit focus, clipboard, undo, and event-routing
rules.

## Loading and failure behavior

The reference shell should keep the host block's DOM identity while its target
changes state. Render visible, non-throwing states for loading, missing,
permission denied, and retryable failure. A missing target must not cause the
host reference block to be removed.

Cycle protection belongs to reference rendering. Pass a set of global target
IDs and a maximum depth through a small context. If the next ID already exists
in the set, render a cycle state instead of resolving it again.

## Avoid these adaptations

- Do not change `useBlock` to return a promise or start a fetch when local
  lookup returns `undefined`.
- Do not add fetched blocks to the host snapshot merely to make `BlockTree`
  render them.
- Do not ask callers for an owning document ID; the repository discovers
  ownership from the global entity ID.
- Do not use React Query independently in every block renderer unless its query
  function returns a shared, reference-counted document session.
- Do not route edits to `useBlock(referenceBlockId).operations`; those commands
  intentionally mutate the local reference block.

## Integration with the current application

The current application page service exposes async `get(id)` and React Query
hooks, but page content is TipTap HTML stored in a mock in-memory map. It is a
useful prototype for loading states, not yet a Rivto entity repository.

Migration should happen in this order:

1. Persist a schema-v5 Rivto snapshot or Yjs update per page/document.
2. Implement `EntityRepository.resolve(id)` above that service and let it find
   the owning document internally.
3. Open the primary page through the same repository.
4. Add the read-only reference block extension.
5. Add live providers, permissions, and editable transclusion only when needed.

See the core boundary analysis in
[`../../rivto-editor-core/docs/database-backed-resolution.md`](../../rivto-editor-core/docs/database-backed-resolution.md).
