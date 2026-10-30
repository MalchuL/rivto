---
status: accepted
---

# One CRDT and one editor per document

Each document has its own CRDT, DocumentModel, core editor, and ReactEditor.
`EditorStorage` caches these instances so panes and embeddings can reuse them.
Ordinary commands always use their editor's fixed document. There is no mediator
that reroutes mutations according to focus or searches other documents for them.
This supports embedding blocks, multiple tabs, and multiple users while loading
only the documents a user opens or references.

## Responsibilities

- `DocumentCRDTRegistry` registers documents without loading their content.
  `YjsDocumentRegistry` uses lazy Yjs subdocuments in a small workspace CRDT.
- `DocumentStorage` opens a CRDT and constructs a model before attaching its
  providers. Its `createDocumentModel(crdt)` factory allows application models
  such as `DBDocumentModel`; the default remains `DocumentModelImpl`.
- DocumentModel owns canonical blocks, elements, hierarchy, plugin data,
  snapshots, transactions, and history. Its manager factories allow subclasses
  to enforce application creation rules without copying tree operations.
- Each core owns definitions, defaults, processors, commands, selection, and
  clipboard for one fixed document. `getDocument()` always returns that model.
- Each ReactEditor owns its renderers, extensions, DOM events, and surfaces around
  one core. Editing uses its focused managers without exposing that core through a getter.
- `EditorStorage` owns loaded models and both editor layers. The host supplies
  a loader and a factory receiving the storage-created core for the appropriate React extensions. Storage does not
  replay extension registrations into other editors or combine their selection.

The application retains the existing root block forest. A document block is
still deferred to journal implementation. An embedding stores
`targetDocumentId` and `targetBlockId`; it neither copies the target nor changes its parent.

## Editor cache and lifetime

An entry is keyed by document ID and contains one pending load or constructed
ReactEditor, its storage-owned core, and independent consumers. Concurrent requests share that entry.
`acquireEditor(id, { signal })` returns `{ editor, document, release }`; release
is asynchronous and idempotent. Cancelling one request does not cancel another
request waiting for the same model.

`getSingleEditor(id)` opens and explicitly retains a core until `closeEditor(id)`.
`getEditor(id)`, `getDocument(id)`, and `getDocuments()` read already loaded entries
without acquiring them. `findDocumentWithBlock(id)` searches loaded models using
record lookup, without reading forests; the first sorted matching document is returned.
`resolveBlock({ documentId, blockId }, { signal })` first checks the preferred source,
then uses optional application/database metadata lookup to discover closed candidates.
Discovery does not load content. The default resolver chooses the first sorted candidate
and reports ambiguity; applications can override `resolveBlock` in the cache options.
Location subscriptions observe membership changes, not text. The stored address stays unchanged.

```tsx
const editors = new EditorStorage({
  openDocument: (id) => documents.openDocument(id),
  createEditor: (editor) => createReactEditor({
    editor,
    extensions: [standardPreset(), embeddingExtension()],
  }),
  lookupDocumentIds: (id, options) => documents.findDocumentIdsWithBlock(id, options),
  subscribeDocumentIds: (listener) => documents.subscribe(listener),
});
const acquisition = await editors.acquireEditor("journal");
// Release this initial consumer after the mounted view retains its document.
<EditorStorageContext.Provider value={editors}>
  <EditorView reactEditor={acquisition.editor} onReady={acquisition.release}>
    <PageSurface />
  </EditorView>
</EditorStorageContext.Provider>;
```

Each `EditorView` receives an already selected ReactEditor and optionally a
`rootBlockId`. It acquires its editor automatically from the nearest `EditorStorageContext.Provider`.
Nested views therefore retain their own consumers without acquisition code in
ordinary renderers or demo components. Standalone ReactEditors also work.

After the final release, storage destroys React registrations, then the core,
then the model and providers. Explicit ownership keeps an entry alive until
closed. After all entries close, the host destroys DocumentStorage's registry.
Failed construction, cancelled loads, and shutdown dispose every owned resource.

## Views and embedding

An embedding reads the nearest `EditorStorageContext`, resolves its document-qualified target, acquires the source ReactEditor, and renders
`<EditorView reactEditor={source} rootBlockId={targetBlockId}>`. All source blocks
use that editor's existing renderers, commands, clipboard, and history. Ordinary
blocks and extensions need no acquisition or owner lookup methods and no extra
operation hook.

Views of the same document share model and history. Each rendered occurrence has
its own DOM boundary, local menus, and event registrations. Selection remains in
the core; the view adapter constrains it to the displayed subtree and shows it
only in the active occurrence. SelectionManager stores no rootBlockId.

The nearest view receives keyboard, input, pointer, clipboard, and selection
events. A parent's capture listener does not also execute a nested editor's
command. Pointer continuations stay with the editor where the gesture began.
Deferred DOM restoration remembers the originating occurrence. Page and edgeless
surfaces reuse the same document operations; mode is React presentation state.

The embedding header belongs to its own block row; the source view renders in
the shared `body` slot below that row. Row hover, checkbox styling, and the
structural selection anchor therefore stay separate from source editing.
Dragging chooses the closest surface under the pointer, including nested views.
An embedded view accepts drops only inside its displayed subtree; same-document
moves exclude the moving subtree, while cross-document drops use the existing
transfer operation. The embedding header does not accept host-document children.

Editing a source updates every occurrence. Source siblings created outside the
referenced subtree remain hidden. A deleted target shows a missing state while
retaining the source editor so undo can restore it. An unresolved or not-yet
received target stays loading. Recursive references stop at the ancestry boundary.
Cycles compare document/block pairs, including the actual source after fallback.
A target moving to another document is found again by its stable local block ID.
If several candidates exist, the first is shown with an ambiguity message; resolving
a different document never silently rewrites the reference props. A lookup error
is not treated as absence. Metadata can identify sources whose content has not arrived yet.

Referencing one block loads the whole source document CRDT. This keeps normal
multi-block transactions and avoids a separate synchronization lifecycle per
block. Unopened, unreferenced documents need not remain in editor memory.

## Database model and IDs

The demo's `DBDocumentModel extends DocumentModelImpl` uses `DemoDatabase`, a
small in-memory application database with document, block, and element records.
It demonstrates the extension point for an SQL or other local database without
replacing the library's default model or adding database calls to renderers.

Before creating a block or element, its manager asks the database for an ID and
reserves the complete creation batch. Block and element IDs share a namespace within
each document, including deleted identities; other documents may reuse the same IDs.
Rows and reservations use `(documentId, id)` keys, matching compound SQL primary keys.
Explicit IDs and processor-generated IDs receive the same local duplicate checks before CRDT
writes. Clipboard imports ask document managers for collision mappings; core does
not generate replacement block IDs itself.

The database persists incremental native CRDT updates. Opening replays them before
providers attach, retaining collaborative container identity instead of rebuilding
independent trees from the same portable snapshot. Changed block and element rows
are saved individually; a text edit does not materialize a full forest. Remote
updates and undo refresh the same rows. Snapshots remain the portable public format.
The demo database lasts for the page session; it is not a SQL server implementation.

For clients in separate demo pages, workspace metadata shares allocated ID kinds
and block-to-document locations. This lets a registry-only client discover a
source without loading every document. Full block/element contents still arrive
only through the acquired document's provider. Real applications can replace this
small metadata index with their database lookup.

## Clipboard and cross-document transfer

Clipboard copies allocate new identities where a source ID is already reserved.
Only reservations in the destination cause replacement IDs. Copied references
to targets inside the copied forest follow the destination document and ID mapping;
external references keep both original IDs. Structured clipboard includes its source
document ID to distinguish these cases. Explicit cross-document transfer receives
source and destination editor APIs, validates destination definitions and
placement before source deletion, and inserts existing stable subtree identities.
Deterministic derived canvas elements also have an explicit identity-reuse path.
Ordinary creation continues to reject duplicates.

A transfer spans two CRDTs and has separate history steps. Undoing only the source
can restore the same ID in both documents. This behavior is intentionally allowed:
histories are not coordinated and IDs are not renamed. A qualified reference still
selects its preferred source; fallback reports ambiguity and shows the first sorted
match until the user changes the address or removes an unwanted local copy.

## Tabs, users, and demo

Panes and tabs for one user share EditorStorage. Different users have independent
caches and document replicas. Matching document IDs synchronize through matching
provider channels. Registry metadata is shared; unopened document contents remain
unloaded. BroadcastChannel supports compatible local browser contexts. WebRTC
supports network peers with an available signaling server.

Open `?embeddings=1&room=<workspace>` to seed source and reference documents.
Use `join=1` in another tab to join without seeding, and `tabs=1` for mounted,
hidden application tabs. `active={false}` suspends interaction and transient menus
throughout nested views while retaining their documents. `repeat=200` adds source
children for performance checks. Closed documents can reopen from the database.

The two-user checks open A/B for both users and C/D privately, respectively.
Edits in A/B synchronize, while each peer has no content provider or loaded model
for the other's private document until it explicitly opens it. Tests also cover
nested acquisitions, source closure, deletion and undo, relocation, clipboard,
selection boundaries, page/edgeless interaction, and bounded work on small and
large documents.
