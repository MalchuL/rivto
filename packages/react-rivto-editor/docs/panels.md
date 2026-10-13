# Panels and element roots

A panel displays the full document or a selected subtree. Applications may keep
a navigation record alongside it; this example type belongs to the host and is not
exported by the editor:

```ts
interface Panel {
  id: string;
  documentId: string;
  rootBlockId: string | null;
  rootElementId: string | null;
}
```

`rootBlockId: null` displays document block roots. A block ID displays its direct
children. `rootElementId: null` selects the document element tree; an element ID
selects that container's descendants, excluding the container itself. Neither null
creates a hidden group or another stored entity. The two roots are independent.

```tsx
const panel: Panel = {
  id: crypto.randomUUID(),
  documentId: runtime.getDocument().id,
  rootBlockId: sectionId,
  rootElementId: null,
};

<EditorPanel
  editor={runtime}
  rootBlockId={panel.rootBlockId ?? undefined}
  rootElementId={panel.rootElementId}
>
  <PageSurface />
</EditorPanel>
```

The host owns navigation, titles, Panel persistence, and runtime lifetime.
The host supplies the editor belonging to its navigation record. A missing block
root stays loading until first observed, then shows the deleted-block state if removed; missing element roots read as empty rather than falling back to document
roots. Undo can restore both data and layout. Panel-local mode defaults to a separate
ModeManager; the host can pass `mode` to retain or explicitly share its state.

## Core and React APIs

`ChildrenPanel` and `EmbeddingPanel` implement framework-neutral `PanelAPI` in
`@chulane/rivto`. They borrow a DocumentEditorAPI and expose bounded blocks/elements;
they create no DOM bindings, subscriptions or storage acquisitions. Whole-document
display is a ChildrenPanel with omitted roots.

`EditorPanel` and `EditorEmbed` create these core panels from their root props and
create and connect an internal ReactPanel in an effect after commit. Cleanup
destroys that instance; StrictMode replay creates a fresh one. The first render,
root/editor replacement, and SSR show loading until the effect supplies a panel.
React components must not construct ReactPanel or ReactEditor manually: use
EditorPanel/EditorEmbed and useReactEditor respectively. `usePanel()` returns that object typed as `PanelAPI`.
`useReactPanel()` returns the same object typed as `ReactPanelApi`, extending `PanelAPI`
with browser operations. Bounded `.blocks` and `.elements` are available directly;
`.editor` is the shared ReactEditorApi, and `.selection`, `.events`, `.keyboard`, `.clipboard`, `.mode`,
and `.slashCommands` belong to browser interaction. Canvas actions are created by
`useEdgelessOperations()` inside the edgeless representation and remain bound to
the original panel even after another panel receives focus.

`subscribe(listener)` forwards whole-document revisions, including edits outside the
panel boundaries; it does not observe selection. Internal `subscribeAvailability`
observes root loading/removal and mount retention separately. Neither hook creates
another core panel, history manager, or document subscription.

## Shared and independent elements

Two Panels with null element roots share the same element tree. Cards are rendered
for the current block scope, while ordinary shapes in the selected element tree
remain shared. For independent geometry, create an ordinary group element and pass
its ID as rootElementId. Multiple Panels can also intentionally share that group.
Deleting a Panel navigation record does not delete document elements. Removing its
element container explicitly removes that subtree through normal element commands.

`editor.elements` exposes document-wide commands. `usePanel().elements`
is the handle restricted to the selected container's descendants. Reads exclude the
container, insertion appends to its children, and writes reject existing outside targets.
Use `{ root: true }` for that panel's root list and `{ parentId }` for an included parent.
The core element manager has no `forRoot` method or root arguments; actual document
roots use `{ parentId: null }` in document-wide operations.

`EditorPanel` displays the selected block’s children. `EditorEmbed` requires
rootBlockId and displays that block together with its descendants, protecting the
root itself from removal and movement. Both accept an independent rootElementId. No public scope is passed around.

## Reconciliation and navigation

One projection is shared by mounted views with the same pair of roots. Opening a
Panel reconciles its block cards before use; subscriptions keep active projections
current. The null/null projection follows runtime lifetime. Reopening an inactive
Panel reconciles edits made while it was closed. Card changes are excluded from undo.

The internal panel lifecycle retains this work through
`reactEditor.blockElements.maintainBlockCards(rootBlockId, rootElementId)` and
calls the returned idempotent cleanup on destruction. The block-elements owner
holds shared root-pair subscriptions and consumer counts; destroying it releases
all remaining scoped maintenance without deleting persisted cards. ReactEditor
has no `acquirePanel` operation. The concrete `blockElements` class remains
available on its API, so this relocation does not hide its methods completely.

Cards retain their ID, frame, stacking order, and custom properties when their block
range can be reused. Both range boundaries moving to a common block parent lets that
parent's projection adopt the existing card. Stored rootBlockId preserves ownership
when a boundary disappears. Stored rootElementId distinguishes an independent
presentation inside a group; it applies only while that group remains an ancestor.
These are block-card properties, not generic element ownership fields. Structural
parentage is determined solely by document roots and element childIds.

Reconciliation modifies only its own cards. Removing an obsolete card promotes any
element children rather than deleting unrelated drawings. No hidden container is
created when opening a block with rootElementId null.

The demo registers an Open block button in the end slot, after block content,
so nested navigation controls do not overlap parent drag handles. Clicking it
or pressing Enter opens the block; the drag handle only controls dragging.
Navigation is an optional application implementation, supplied through demo-owned
React context, with no navigation callbacks in EditorPanel or ReactPanelApi. The
demo uses shadcn/ui Breadcrumb and retains Panel-local mode in its navigation history.
When a block is first opened, the demo creates an empty ordinary group and uses
its ID as the Panel's rootElementId. Reconciliation inserts that Panel's block
cards inside the group; drawings and pasted elements are inserted there too.
Returning through breadcrumbs and reopening the block reuse the same group.
Opening a Panel adds no undo step. The document Panel keeps its null element root,
so it can still access the complete element tree, including those groups.
The demo retains Panel records only while mounted; applications that persist
navigation should store both root IDs with each Panel record.

## Storage format

Snapshot version 9 contains flat elements with ordered childIds and one ordered
rootElementIds list. Every element occurs exactly once in that tree. There are no
Canvas records or generic canvasId fields. Grouping preserves canvas coordinates;
removing a parent deletes its subtree, and ungrouping promotes its children.
Concurrent hierarchy repair removes duplicate references and retains orphaned
records at document roots. Older snapshots are rejected; no migration is provided.
Panel records and navigation history remain application data outside this snapshot.

## Nested element input and reads

Use `children` to create a complete element subtree. Leaves omit children; every
new descendant is attached according to its input nesting. An element with children may omit `frame`:
the model computes the union of its child frames at insertion time. Elements
without children still require geometry. Child coordinates stay relative
to the canvas, including inside nested groups.

```ts
const group = usePanel().elements.insertElement({
  type: "group",
  zIndex: 1,
  children: [
    { type: "shape", zIndex: 2, frame: { x: 20, y: 30, width: 100, height: 60 } },
    { type: "shape", zIndex: 3, frame: { x: 160, y: 30, width: 80, height: 60 } },
  ],
});
```

`DocumentElement` / `EditorElement` contains recursive `children`.
`ElementNode` / `EditorElementNode` contains direct `childIds` instead.

| Operation | Result |
|---|---|
| `getElement(id)` | Cached complete subtree, or undefined |
| `getElements()` | Cached array of root trees; unchanged branches retain identity |
| `getElementNode(id)` | Cached flat node, or undefined; does not materialize descendant snapshots |
| `getElementNodes()` | Stable flat collection containing roots and descendants |
| `subscribeElement(id, listener)` | Changes to the element or its descendants |
| `subscribeElementNode(id, listener)` | Changes to that node's fields or child list |

Rendering and interaction managers use flat reads. Recursive snapshots invalidate
changed nodes and their old/current ancestors; unrelated branches retain identity.
Reads inside a transaction bypass snapshot caches. Use operations to edit the
model rather than mutating cached values.

Insertion validates the full prepared tree before shared writes and creates it in
one transaction. Editor processors run on each new node, including children added
by a processor. Supplied IDs remain stable; copying a tree into a document that
already contains those IDs requires remapping them first. The React `edgeless.selection.group` command remains
the operation for grouping existing records without recreating them. Low-level
`childIds` input can reparent existing elements; it cannot be combined with new
defined `children` (including an empty array).

Snapshot v9 stores flat records and a document rootElementIds list. Recursive input is converted
into the same root and child ID lists; recursive output is assembled on demand.
Only selected groups mount their outline/hit-plate components. This does not add
viewport virtualization for canvas visuals; page virtualization remains separate.

Canvas tools and creation defaults belong to each mounted edgeless representation.
Switching to the page surface unmounts that representation and resets them; returning to edgeless creates fresh tools, defaults, and previews.
Panels share type definitions, not tool choices or remembered creation settings.
The edgeless.tool.set named command requires explicit { operations, payload }
from the owning canvas; it cannot select a tool through a panel alone.
