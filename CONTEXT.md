# Rivto Editor

Rivto models collaborative documents as blocks while supporting both text-level and whole-block interaction.

## Language

**Text-editable block**:
A block whose content supports a text caret and character-range selection.
_Avoid_: Text editing block, editable-text block

**Structural selection anchor**:
The region of a block that explicitly permits a pointer gesture to begin whole-block selection.
_Avoid_: Non-text area, click target

**Whole-block selection**:
A local selection of one or more complete document blocks rather than character ranges within their content.
_Avoid_: Selected as block

**Selection**:
One local, non-persisted value that may contain block ranges, canvas element IDs, and extension-owned data.
_Avoid_: Selection item, editor selection item, block selection

**Block range**:
The portion of one block covered by a Selection, expressed as start-inclusive and end-exclusive UTF-16 offsets. An end of `-1` means the block's current end.
_Avoid_: Selected block, block selection

**Resolved selection**:
A Selection whose block ranges have been checked against the current document and paired with their live blocks.
_Avoid_: Normalized selection

**Clipboard bundle**:
The portable, lossless document data copied between Rivto editors, independent of browser clipboard events.
_Avoid_: Clipboard payload

**Paste strategy**:
One paste algorithm selected from clipboard content and destination intent.
_Avoid_: Paste handler

**Empty writing block**:
A text-editable block that the host considers to contain no meaningful writing content.
_Avoid_: Blank block, zero-length block

**Markdown hyperlink**:
A URL or in-document href inside writing-block Markdown content. This is not a first-class document entity.
_Avoid_: Document link, block link

**First-child promotion**:
Replacement of an empty parent by its first child, with the remaining children retained beneath that promoted child in their existing order.
_Avoid_: Flatten children, delete parent subtree
