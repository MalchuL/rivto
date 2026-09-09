# Selection in Rivto

Core selection contains whole blocks only. Native text editing inside one block
is separate React host context; it cannot become a mixed text/block selection.

## Ownership

| Owner | State or operation |
| --- | --- |
| `editor.selection` | Whole-block IDs, anchor/focus direction, membership subscriptions |
| `reactEditor.selection` | One single-block text range for editing and DOM restoration; routes block context to core |
| `window.getSelection()` | Live DOM nodes and offsets |
| Edgeless selection runtime | Canvas element/group IDs |
| `editor.clipboard` | Whole-block copy/cut/paste and explicit single-block text copy/paste |

These are local states. The document-model package owns persisted document
invariants; the CRDT package synchronizes mutations, not local selection.

## Core contract

```ts
editor.selection.set([{
  type: "block",
  blockIds: ["a", "c"],
  anchorBlockId: "c",
  focusBlockId: "a",
}]);
```

IDs must exist; both endpoints must belong to the selected set. IDs are
deduplicated and ordered against the document tree. Gaps stay unselected.
`normalize()` returns `{ blocks }` or `undefined`; it never fills gaps or
introduces character offsets. Selecting a parent copies/deletes its full subtree.

`get()` returns a detached copy. `snapshot()` retains identity until membership
or direction changes and must be treated as immutable. `isBlockSelected(id)`
supports per-block chrome. Selection updates notify selection subscribers
without increasing the editor's document revision.

`delete()` removes selected subtrees in one transaction/undo item and clears
selection. Remote edits, undo, and structural moves filter missing IDs, reorder
survivors, and repair anchor/focus direction.

## Text editing and gestures

`reactEditor.selection.get()` resolves either whole-block items or exactly one
single-block text range. `set()` rejects mixed selections and cross-block text
ranges. `readDOM()` reads current endpoints; cross-block endpoints become an
inclusive block selection. `restoreDOM()` restores only single-block text.
`delete()` handles the explicit text range or delegates block deletion to core.

A drag within one editable block remains native text selection. Crossing a block
boundary selects complete blocks, including Alt-drag. Returning to the original
block restores its local text range. Ctrl/Cmd-click toggles whole blocks;
Shift-click extends a block range. Shift+Up/Down becomes whole-block selection
when movement crosses blocks. There is no supplemental cross-block text highlight.

The host retains text offsets only to survive DOM replacement, and clamps them
when resolving a shorter block. Missing blocks cannot be restored. This is not
collaborative relative-position tracking.

## Clipboard cases

```ts
const textTarget = {
  type: "text" as const,
  anchor: { blockId: "a", offset: 2 },
  head: { blockId: "a", offset: 5 },
};

const bundle = editor.clipboard.copyText(textTarget);
const caret = editor.clipboard.paste({
  bundle,
  textTarget,
});
if (caret) {
  reactEditor.selection.set([{ type: "text", anchor: caret, head: caret }]);
  reactEditor.selection.restoreDOM();
}
```

- `copy()` and `cut()` operate on whole-block selection.
- `copyText(range)` copies selected characters only, without the block's children.
  A collapsed range returns `undefined`.
- `paste({ textTarget })` accepts one explicit block-local range and returns the
  resulting `EditorPosition` for text insertion, or `undefined` for structural
  insertion/no-op. It never writes a text item into core selection.
- Whole-block bundles stay structural at a text caret. `placement` controls
  sibling/child insertion; selected top-level parents take precedence over
  nested focus endpoints.
- Partial-text bundles merge into an explicit text target. Existing version-4
  bundles with several roots remain readable; the first root merges and the
  suffix moves to the final root.
- Plain text replaces the explicit range. Newlines create siblings unless
  `preserveNewlines: true`. Without a text target, plain text creates blocks.
- Ctrl/Cmd+Shift+V uses the browser's plain-text flavor with preserved newlines,
  so content copied from multiple blocks can enter one editable block.

The browser extension reads native endpoints immediately before clipboard
events, writes formats before deleting cut content, and restores a returned
caret after React commits. No general processor registry is needed for these
specific cases; existing formatters/parsers still handle custom block formats.

## Migration

Replace core `selection.set([{ type: "text", ... }])` with a React editing
context update, or pass `textTarget` directly to a headless clipboard operation.
Mixed ranges and cross-block text selection are no longer supported.
`ReactSelection` is host operation context, not the core `EditorSelection` type.

`useEditorSelection()` and `useBlockSelection()` report whole blocks only.
Extensions needing a caret read the React selection bridge. Keyboard operations
use that context explicitly while block manager commands continue to consume
core block selection.

Page and edgeless card editors use the same text/block rules. Canvas selection
remains separate. Clipboard temporarily projects selected cards into block IDs
for placement, then restores the previous host context.
