# Selection in Rivto

Selection contracts live beside `SelectionManager` in core. The React manager
is a DOM adapter over that single state. The edgeless runtime is a view over the
same selection and stores its active flag in generic plugin data.

## Core contract

Stored selection is a generic `type: "selection"` value that can contain
blocks, element IDs, and extension-owned plugin data. Block `start` and `end`
are absolute UTF-16 offsets from the beginning of `content` and form a
`[start, end)` range. `end: -1` is the only sentinel and means the current end
of the block. Therefore `{ start: 0, end: -1 }` denotes structural coverage and
distinguishes a selected empty block from a caret at offset zero.

```ts
editor.selection.set([{
  type: "selection",
  blocks: [
    { id: "a", start: 0, end: -1 },
    { id: "c", start: 0, end: -1 },
  ],
  elements: ["shape-1"],
  pluginData: { edgelessSelection: { active: true } },
  anchorBlockId: "c",
  focusBlockId: "a",
}]);
```

`set()` and `get()` use this same shape. DOM adapters convert native endpoints
with `createTextSelection` or `createCaretSelection` before publishing. Whole-block
gestures use `createStructuralSelection`, which writes the live-end sentinel.

A caret is one block whose covered slice is empty: `{ start: n, end: n }`.

`resolveBlockSelection()` resolves stored offsets against **current document lengths** (not
Yjs relative positions). Apart from `end: -1`, negative, reversed, out-of-range,
or non-integer markers do not throw: copy uses `""` for that block, and
delete/paste still run as an empty slice at a clamped caret.

`isBlockSelected(id)` paints chrome only for `{ start: 0, end: -1 }` members.
Text ranges, including fully covered middle text blocks, use only native text
highlighting. Contentless blocks inside the range use the structural sentinel
because they have no character range to paint.

`get()` returns detached values. `snapshot()` keeps identity until selection
changes. Selection is local runtime state and is never persisted or synchronized.

## Browser gestures

`reactEditor.selection` delegates state to core and adds `readDOM()` and
`restoreDOM()`. Shift+Alt-click or Shift+Alt-drag keeps partial first/last
offsets and full text ranges between them without structural chrome. A
contentless block such as Counter receives structural coverage while surrounding
editable blocks remain text ranges. Alt-drag and Shift-click across hosts
select whole blocks. Ctrl/Cmd-click toggles `{ start: 0, end: -1 }` block
ranges. Shift-click and Shift+Up/Down extend block ranges once they cross a
host.

## Clipboard strategies

`ClipboardManager` builds one `PasteContext` and a separate `PastePlacement`, then
runs every registered `PasteStrategy` whose `matches(context, placement)` is true:

- `TextPasteStrategy` replaces a selected range with plain text (splitting
  newlines) or a mergeable partial structured bundle.
- `PreserveNewlinesPasteStrategy` inserts plain text as one block when
  `placement.preserveNewlines` is set (Ctrl/Cmd+Shift+V).
- `BlockPasteStrategy` inserts complete remapped block forests. `placement.mergeText: false` keeps a partial-text bundle structural.
- React registers `ElementPasteStrategy` on `editor.clipboard.pasteStrategies`
  so canvas geometry stays in the presentation layer without a second manager
  dispatch.

Strategies are constructed once with the editor. Paste calls only pass context
and placement. Text ranges are derived from the paste-time selection.

All-`{ start: 0, end: -1 }` block coverage is structural copy/delete. Any partial range or
caret is text-like. A collapsed valid caret copy returns
`undefined`. Ctrl/Cmd+Shift+V still chooses plain text with preserved newlines;
ordinary paste prefers Rivto structured data.
