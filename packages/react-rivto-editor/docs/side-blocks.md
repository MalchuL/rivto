# Side blocks

Side blocks are lightweight React components associated with document blocks or
canvas elements. Their records live in document plugin data; they are not part of
the document block hierarchy and are not included in block clipboard payloads.
The page editor can render block-anchored items beside their anchors, while the
comments extension displays canvas discussions in a separate sidebar. Embedded
views do not render the side-block plugin data.

Register one shared page layout with renderer components keyed by record type:

```tsx
import {
  createSideBlock,
  sideBlocksExtension,
  type SideBlockRendererProps,
} from "@chulane/rivto-react";

function Note({ block, update, remove }: SideBlockRendererProps) {
  const text = typeof block.data === "string" ? block.data : "";
  return (
    <div>
      <textarea aria-label="Note" value={text} onChange={(event) => update(event.target.value)} />
      <button type="button" onClick={remove}>Delete</button>
    </div>
  );
}

const extension = sideBlocksExtension({ renderers: { note: Note } });
// Install `extension` with the editor's other React extensions.
// Once an anchor exists, create its side block using the document model:
createSideBlock(editor.getDocument(), {
  anchorId,
  type: "note",
  data: "A note",
  spacing: "flow",
});
```

`spacing: "reserve"` is the default and reserves enough vertical room for the
component; `"flow"` lets the component extend beside following document rows.
`placement: "right"` is the default; `"left"` places a component on the other
side. Flowing side components sit outside the page column and do not narrow it
or add vertical space. The host must allow overflow where those components
should be visible. `"full"` places the component across the editor width below
the anchor row. Full-width content with `"flow"` can cover
subsequent document content; use `"reserve"` when it must push content down.
Side components are vertically centered on their anchor row and show a curved
connector to the center of the nearest side of its anchor row. Each `SideBlockCard` has its own connector;
other side content uses one connector for the component. Components are ordered
by anchor position and creation time, and are moved down
to avoid overlapping earlier components on the same side. The layout only measures mounted
anchors. Side components are hidden while their anchor is collapsed, outside the
panel, or unmounted by virtualization, and return when it mounts again.

The `--rivto-side-block-width` and `--rivto-side-block-gap` CSS custom properties
configure the side columns. The default width is the smaller of 280px and 35vw;
the default gap is 16px.

Use `createSideBlock`, `updateSideBlockData`, and `deleteSideBlock` for mutations.
They use the document's history and enforce portable plugin data. Each side block
has an independent namespace so different records created concurrently merge;
concurrent replacements of the same record use the CRDT's conflict resolution.
Keep data small and use independent records when independent concurrent edits must
merge. Snapshots include plugin data. Moving an anchor retains the association;
copying a document block does not copy its side blocks. Deleting an anchor retains
its side blocks as hidden orphan records so undo can restore them without data
loss. Applications can explicitly delete unwanted records.

The comments example registers `createCommentSideBlockRenderer` under
`COMMENT_SIDE_BLOCK_TYPE` and installs `commentsExtension`. Messages are stored
as separate collaborative fields per thread; editing the same message
concurrently uses conflict resolution for that field. The default demo shows a
flow note on each side. Each demo note stores a document block ID under
`data.rootBlockId`; the root's children are ordinary collaborative document
blocks. The demo registers a contentless `demo.side-note-container` block as
that root and uses the shared container behavior. Its children retain their own
IDs, type, content, properties, list properties, plugin data and
children use the document manager. The demo displays each child in a
separate card using its registered Page layout and block renderer. The demo creates an
independent panel for each note; it reads and writes the document subtree while
the collection root remains outside the page root list. Its
slash and block context menus use the shared runtime registrations, including
block types registered after the side panel mounts. Side panels support block
deletion, duplication, and merging with Backspace. List and background menu actions use the shared Page
presentation. The panel can read, edit, insert, move, indent, outdent, and import nested blocks.
Side-block property updates, type changes, creation, and import run the editor's
registered block processors. Ordered property batches use the same intermediate
processor state as document updates and publish only after all changes succeed.
Keyboard indent and outdent resolve move policies against the invoking panel's
collection, including nested blocks; Backspace at the start of a nested block
can also outdent it within the side panel.
Columns stack their lanes when their available width cannot accommodate them
side by side; their drop axis follows the displayed layout.
The shared expanded-container dialog borrows the invoking panel's block source,
so Bento, Kanban, and Table blocks in a side note retain their editable children.
When the host installs `pageDragExtension`, side panels use the same drag handles,
drop feedback, and block movement policies as other Page occurrences. Blocks can
be reordered or nested within a note and moved between eligible panels; these
moves use document history and can be undone. Without that extension, the side
editor retains its non-drag interactions.
An extension can register a persistent block source with `editor.blockSources`.
Its source ID and collection ID are stored alongside
the document and block IDs in copied embeddings, allowing a source editor to reopen
the collection even when its original side card is not mounted. Missing sources or
collections display an unavailable status and become available when restored.
Document-owned note blocks use ordinary document and block IDs in embeddings;
other collection owners can register their own lookup and opening operations
without changing the embedding extension.
The source must use a stable ID in every editor that can open the data, locate
blocks unambiguously, and observe collection creation, edits, deletion, and
restoration even when the collection is currently missing. Its opener borrows
the source document and must not depend on a mounted side-card component.
The block context menu can also be opened from a focused side block with
Shift+F10 or the Context Menu key; dismissing it restores keyboard focus.
While the menu remains open, document updates refresh registered actions and
their checked states, including actions that inspect nested blocks. Application
state outside the document does not independently trigger a menu refresh.
An editor embedded inside a side block retains its own context-menu input and
does not open the enclosing side card's menu.

`SideBlockEditor` provides this panel to its children. Supply `rootBlockId` for a
document-owned subtree; the panel displays its children and shares document history.
Each occurrence has its own selection, while block content, subscriptions and undo
remain owned by the document. The panel is created after mounting and destroyed on
unmount; changing the root creates a new panel for the new subtree. Renderers can use
`getSideBlock(document, id)` to read the current record without constructing a
plugin-data namespace; missing or malformed records return `undefined`.
`SideBlockContent`
borrows the panel's Page controller, registers its DOM root, and renders its root
blocks as cards. `SideBlockEditor` mounts the runtime's current extension UI and
updates it when registrations change. Block IDs must be unique within the document.
The panel owns its own selection while borrowing the document editor and its history;
mutations through the panel respect the boundary at its selected root.
The editor's keyboard and context menu add or delete individual items. On narrow screens, these example
notes stack after the document. Note associations are plugin data; their block
subtrees are stored and synchronized by the document manager, so independent
block edits do not replace the entire note. Open
`/?sideBlocks=1` and use `/comment`, `/side`, or `/full` to create additional examples. The block
context menu also adds notes to the left or right of the clicked block.

The demo note's top-right controls delete the whole note or open its appearance
settings. Appearance, fill, border color, dashed style, and dash animation are
stored on the document container. Fill and border use the same color swatches as
the block-handle menu, with an additional explicit transparent choice. Borderless editor appearance hides the fill
and border while preserving their settings; reduced-motion preferences disable
the dash animation. The empty note offers an Add block control; populated notes
use the editor's normal keyboard and context-menu block actions.
